package com.chatgptcourses.editorial.service;

import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.editorial.service.ContentValidation.*;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.service.AssetTypes.*;
import com.chatgptcourses.assets.storage.ObjectStorage;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.PublicMetadata;
import com.chatgptcourses.catalog.service.CatalogTypes.SaveMetadata;
import com.chatgptcourses.catalog.service.PublicMetadataStore;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;

/** Explicit privileged local/test import, never an application startup seed. Each durable step is atomic;
 * remote staging writes are outside SQL transactions and only the P10 confirmer can create READY assets. */
public final class EditorialImportService {
    public record Manifest(int schemaVersion,String namespace,List<Item> items,List<FileEntry> files) { @Override public String toString(){return "ImportManifest[redacted]";} }
    public record Item(String key,ResourceKind kind,String locale,String sourceFile,List<String> childKeys,PublicMetadata metadata,List<String> resourceFileKeys,List<String> solutionFileKeys) { @Override public String toString(){return "ImportItem[redacted]";} }
    public record FileEntry(String key,String locale,String path,String purpose,String sha256) { @Override public String toString(){return "ImportFile[redacted]";} }
    public record Source(String slug,String title,String summary,String objectives,String evaluationDefinition,ContentDocument document) { @Override public String toString(){return "ImportSource[redacted]";} }
    public record ItemResult(String key,String locale,String state,UUID translationId,UUID resourceId,UUID versionId,UUID revisionId) { }
    public record FileResult(String key,String locale,String purpose,UUID assetId,String state) { }
    public record Report(String mode,String namespace,List<ItemResult> items,List<FileResult> files) { }
    private record Input(Item item,Source source,byte[] hash) { }
    private record Binding(UUID translation,UUID revision,byte[] hash,byte[] applied,boolean complete) { }
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final EditorialService editorial;private final AssetService assets;private final ObjectStorage storage;private final TransactionTemplate tx;private final long maxFileBytes;private final String environment;
    public EditorialImportService(JdbcTemplate jdbc,ObjectMapper mapper,EditorialService editorial,AssetService assets,ObjectStorage storage,TransactionTemplate tx,long maxFileBytes,String environment){this.jdbc=jdbc;this.mapper=mapper;this.editorial=editorial;this.assets=assets;this.storage=storage;this.tx=tx;this.maxFileBytes=maxFileBytes;this.environment=environment;}
    public Report run(Path manifestPath,UUID actor,boolean apply)throws java.io.IOException{
        check(Set.of("local","test").contains(environment));check(actor!=null);Path manifest=manifestPath.toRealPath(),root=manifest.getParent();
        Manifest m=decode(read(manifest,2*1024*1024),Manifest.class);check(m.schemaVersion()==1&&key(m.namespace(),false));list(m.items(),100);list(m.files(),200);check(!m.items().isEmpty());
        var files=new LinkedHashMap<String,FileEntry>();var bytes=new HashMap<String,byte[]>();long totalFileBytes=0;
        for(var f:m.files()){check(f!=null&&key(f.key(),true));locale(f.locale());check(Set.of("RESOURCE","SOLUTION").contains(f.purpose()));check(f.sha256()!=null&&f.sha256().matches("[a-f0-9]{64}"));String fk=f.key()+":"+f.locale();check(files.putIfAbsent(fk,f)==null);Path path=resolve(root,f.path());check(path.getFileName().toString().matches("(?i).+\\.(md|txt)"));totalFileBytes+=Files.size(path);check(totalFileBytes<=64L*1024*1024);byte[] value=read(path,maxFileBytes);check(value.length>0&&HexFormat.of().formatHex(hash(value)).equals(f.sha256()));bytes.put(fk,value);}
        var inputs=new LinkedHashMap<String,Input>();
        for(var item:m.items()){check(item!=null&&key(item.key(),true)&&item.kind()!=null);locale(item.locale());list(item.childKeys(),100);list(item.resourceFileKeys(),20);list(item.solutionFileKeys(),10);for(var keys:List.of(item.childKeys(),item.resourceFileKeys(),item.solutionFileKeys()))check(new HashSet<>(keys).size()==keys.size());check(item.solutionFileKeys().isEmpty()||item.kind()==ResourceKind.ACTIVITY);check(Collections.disjoint(item.resourceFileKeys(),item.solutionFileKeys()));
            var s=decode(read(resolve(root,item.sourceFile()),64*1024),Source.class);slug(s.slug());header(s.title(),s.summary(),"Local draft import");pedagogy(s.objectives(),s.evaluationDefinition());document(s.document(),mapper);check(s.document().media().isEmpty()&&(s.document().exercise()==null||s.document().exercise().solutionAssetIds().isEmpty()));check(item.solutionFileKeys().isEmpty()||s.document().exercise()!=null);new PublicMetadataStore(jdbc,mapper).validate(metadata(item));
            var descriptors=new ArrayList<FileEntry>();for(String k:item.resourceFileKeys())descriptors.add(file(files,k,item.locale(),"RESOURCE"));for(String k:item.solutionFileKeys())descriptors.add(file(files,k,item.locale(),"SOLUTION"));
            byte[] digest=hash(mapper.writeValueAsBytes(List.of(s,item.childKeys(),metadata(item),descriptors)));check(inputs.putIfAbsent(item.key()+":"+item.locale(),new Input(item,s,digest))==null);
        }
        for(var f:files.values())check(inputs.values().stream().anyMatch(i->i.item.locale().equals(f.locale())&&(i.item.resourceFileKeys().contains(f.key())||i.item.solutionFileKeys().contains(f.key()))));
        List<Input> ordered=ordered(inputs);tx.executeWithoutResult(status->authorize(actor,apply));
        // Validate every already imported item before changing any item. A human edit is never adopted silently.
        tx.executeWithoutResult(status->{lock(m.namespace(),actor,apply);for(var input:ordered){var b=binding(m.namespace(),input.item);if(b!=null)verify(actor,b);}});
        var results=new ArrayList<ItemResult>();
        for(var input:ordered){
            var item=input.item;var prior=tx.execute(status->{lock(m.namespace(),actor,apply);var b=binding(m.namespace(),item);if(b!=null)verify(actor,b);return b;});
            if(!apply){results.add(result(item,prior==null?null:editorial.get(actor,prior.translation),prior==null?"CREATE_DRAFT":Arrays.equals(prior.hash,input.hash)&&prior.complete?"UNCHANGED":"UPDATE_DRAFT"));continue;}
            if(prior!=null&&prior.complete&&Arrays.equals(prior.hash,input.hash)){results.add(result(item,editorial.get(actor,prior.translation),"UNCHANGED"));continue;}
            ContentView content=tx.execute(status->{lock(m.namespace(),actor,true);var b=binding(m.namespace(),item);if(b!=null){verify(actor,b);return editorial.get(actor,b.translation);}
                var refs=jdbc.query("SELECT resource_id,version_id FROM editorial_import_resources WHERE namespace=? AND logical_key=?",(rs,n)->new UUID[]{rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)},m.namespace(),item.key());var doc=withFiles(input.source.document(),item.resourceFileKeys().stream().map(k->new MediaReference(UUID.randomUUID(),"FILE",true,k)).toList(),item.solutionFileKeys().stream().map(k->UUID.randomUUID()).toList());
                ContentView created;
                if(refs.isEmpty()){var children=childVersions(m.namespace(),item);created=editorial.create(actor,new CreateContent(item.kind(),item.locale(),input.source.slug(),input.source.title(),input.source.summary(),input.source.objectives(),input.source.evaluationDefinition(),doc,children,"Explicit local draft import"));jdbc.update("INSERT INTO editorial_import_resources(namespace,logical_key,resource_id,version_id,kind) VALUES(?,?,?,?,?)",m.namespace(),item.key(),created.resourceId(),created.versionId(),item.kind().name());}
                else{UUID version=refs.getFirst()[1];var existing=jdbc.query("SELECT id FROM content_translations WHERE pedagogical_version_id=? ORDER BY CASE locale WHEN 'fr' THEN 0 ELSE 1 END,id LIMIT 1",(rs,n)->rs.getObject(1,UUID.class),version);check(!existing.isEmpty());var source=editorial.get(actor,existing.getFirst());if(source.kind()!=item.kind()||!source.objectives().equals(input.source.objectives())||!source.evaluationDefinition().equals(input.source.evaluationDefinition()))throw conflict();created=editorial.translate(actor,source.id(),tag(source),new CreateTranslation(item.locale(),input.source.slug(),input.source.title(),input.source.summary(),doc,"Explicit local draft translation"));}
                jdbc.update("INSERT INTO editorial_import_translations(namespace,logical_key,locale,translation_id,last_revision_id,source_sha256,applied_sha256,created_at,updated_at) SELECT ?,?,?,?,?,?,?,stamp,stamp FROM(SELECT clock_timestamp() AS stamp) s",m.namespace(),item.key(),item.locale(),created.id(),created.currentRevisionId(),input.hash,fingerprint(created));return created;
            });
            var ordinary=new ArrayList<MediaReference>();var solutions=new ArrayList<UUID>();
            for(String k:item.resourceFileKeys()){var f=file(files,k,item.locale(),"RESOURCE");UUID id=importFile(m.namespace(),f,bytes.get(k+":"+item.locale()),content,actor);ordinary.add(new MediaReference(id,"FILE",true,Path.of(f.path()).getFileName().toString()));}
            for(String k:item.solutionFileKeys()){var f=file(files,k,item.locale(),"SOLUTION");solutions.add(importFile(m.namespace(),f,bytes.get(k+":"+item.locale()),content,actor));}
            byte[] captured=fingerprint(content);
            ContentView finished=tx.execute(status->{lock(m.namespace(),actor,true);var b=binding(m.namespace(),item);verify(actor,b);var current=editorial.get(actor,b.translation);if(!b.revision.equals(content.currentRevisionId())||!Arrays.equals(b.applied,captured)){if(b.complete&&Arrays.equals(b.hash,input.hash))return current;throw conflict();}if(!current.objectives().equals(input.source.objectives())||!current.evaluationDefinition().equals(input.source.evaluationDefinition())||!current.slug().equals(input.source.slug()))throw conflict();
                var desired=withFiles(input.source.document(),ordinary,solutions);if(!current.title().equals(input.source.title())||!current.summary().equals(input.source.summary())||!Objects.equals(current.document(),desired))current=editorial.revise(actor,current.id(),tag(current),new SaveRevision(input.source.title(),input.source.summary(),desired,"Explicit local draft import"));
                if(!current.childVersionIds().equals(childVersions(m.namespace(),item)))current=editorial.composition(actor,current.id(),tag(current),new ReplaceComposition(childVersions(m.namespace(),item),"Explicit local draft composition"));
                if(!Objects.equals(current.metadata(),metadata(item)))current=editorial.metadata(actor,current.id(),tag(current),new SaveMetadata(metadata(item),"Explicit local draft metadata"));
                check(current.state()==EditorialState.DRAFT);jdbc.update("UPDATE editorial_import_translations SET last_revision_id=?,source_sha256=?,applied_sha256=?,complete=true,revision=revision+1,updated_at=greatest(created_at,updated_at,clock_timestamp()) WHERE namespace=? AND logical_key=? AND locale=?",current.currentRevisionId(),input.hash,fingerprint(current),m.namespace(),item.key(),item.locale());return current;});
            results.add(result(item,finished,prior==null?"CREATED_DRAFT":"UPDATED_DRAFT"));
        }
        var fileResults=new ArrayList<FileResult>();for(var f:m.files()){var matches=jdbc.query("SELECT a.id,a.state FROM editorial_import_files f JOIN assets a ON a.id=f.asset_id WHERE f.namespace=? AND f.logical_key=? AND f.locale=? AND f.purpose=? AND f.source_sha256=? ORDER BY f.attempt DESC LIMIT 1",(rs,n)->new FileResult(f.key(),f.locale(),f.purpose(),rs.getObject(1,UUID.class),rs.getString(2)),m.namespace(),f.key(),f.locale(),f.purpose(),HexFormat.of().parseHex(f.sha256()));fileResults.add(matches.isEmpty()?new FileResult(f.key(),f.locale(),f.purpose(),null,"CREATE_INTENT"):matches.getFirst());}
        return new Report(apply?"APPLY":"PLAN",m.namespace(),List.copyOf(results),List.copyOf(fileResults));
    }
    private UUID importFile(String namespace,FileEntry f,byte[] bytes,ContentView origin,UUID actor){
        // The immutable binding is committed before any upload. A crash after the PUT resumes the same intent.
        UUID asset=tx.execute(status->{lock(namespace,actor,true);var rows=jdbc.query("SELECT a.id,a.state FROM editorial_import_files f JOIN assets a ON a.id=f.asset_id WHERE f.namespace=? AND f.logical_key=? AND f.locale=? AND f.purpose=? AND f.source_sha256=? ORDER BY f.attempt DESC LIMIT 1",(rs,n)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2)),namespace,f.key(),f.locale(),f.purpose(),HexFormat.of().parseHex(f.sha256()));
            if(!rows.isEmpty()&&Set.of("READY","PENDING").contains(rows.getFirst().getValue())){var id=rows.getFirst().getKey();if("READY".equals(rows.getFirst().getValue()))return id;var info=jdbc.queryForMap("SELECT bucket_name,staging_key,expires_at>clock_timestamp() AS valid FROM assets WHERE id=?",id);if(Boolean.TRUE.equals(info.get("valid"))&&storage.head(new ObjectStorage.Location((String)info.get("bucket_name"),(String)info.get("staging_key"))).isEmpty())return id;var view=assets.confirmEditorial(actor,actor,id);if(Set.of("READY","PENDING").contains(view.state()))return id;}
            int attempt=jdbc.queryForObject("SELECT coalesce(max(attempt),0)+1 FROM editorial_import_files WHERE namespace=? AND logical_key=? AND locale=? AND source_sha256=?",Integer.class,namespace,f.key(),f.locale(),HexFormat.of().parseHex(f.sha256()));
            var intent=assets.createEditorialIntent(actor,actor,new EditorialUploadRequest(origin.resourceId(),origin.versionId(),f.locale(),Path.of(f.path()).getFileName().toString(),"text/plain",bytes.length,f.purpose()));jdbc.update("INSERT INTO editorial_import_files(id,namespace,logical_key,locale,purpose,source_sha256,asset_id,attempt) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),namespace,f.key(),f.locale(),f.purpose(),HexFormat.of().parseHex(f.sha256()),intent.asset().id(),attempt);return intent.asset().id();});
        var view=assets.getEditorial(actor,asset);if("READY".equals(view.state()))return asset;
        var location=jdbc.queryForObject("SELECT bucket_name,staging_key FROM assets WHERE id=?",(rs,n)->new ObjectStorage.Location(rs.getString(1),rs.getString(2)),asset);
        storage.put(location,bytes,"text/plain","attachment");
        var ready=tx.execute(status->{lock(namespace,actor,true);return assets.confirmEditorial(actor,actor,asset);});if(!"READY".equals(ready.state()))throw new ApiException(ApiError.ASSET_NOT_READY);return asset;
    }
    private void verify(UUID actor,Binding b){var current=editorial.get(actor,b.translation);if(!b.revision.equals(current.currentRevisionId())||!Arrays.equals(b.applied,fingerprint(current))||current.state()!=EditorialState.DRAFT)throw conflict();}
    private Binding binding(String ns,Item item){var rows=jdbc.query("SELECT translation_id,last_revision_id,source_sha256,applied_sha256,complete FROM editorial_import_translations WHERE namespace=? AND logical_key=? AND locale=?",(rs,n)->new Binding(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getBytes(3),rs.getBytes(4),rs.getBoolean(5)),ns,item.key(),item.locale());return rows.isEmpty()?null:rows.getFirst();}
    private byte[] fingerprint(ContentView v){return hash(mapper.writeValueAsBytes(Arrays.asList(v.id(),v.resourceId(),v.versionId(),v.locale(),v.slug(),v.state(),v.currentRevisionId(),v.title(),v.summary(),v.document(),v.childVersionIds(),v.metadata(),v.objectives(),v.evaluationDefinition())));}
    private List<UUID> childVersions(String ns,Item i){var result=new ArrayList<UUID>();for(String key:i.childKeys()){var ids=jdbc.query("SELECT version_id FROM editorial_import_resources WHERE namespace=? AND logical_key=?",(rs,n)->rs.getObject(1,UUID.class),ns,key);if(ids.isEmpty())throw conflict();result.add(ids.getFirst());}return result;}
    private void lock(String ns,UUID actor,boolean write){jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"editorial-import:"+ns);if(write)jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor);authorize(actor,write);}
    private void authorize(UUID actor,boolean write){boolean ok=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,write?"content.write":"content.read"));if(!ok)throw new AccessDeniedException("Content import not allowed");}
    private static FileEntry file(Map<String,FileEntry> files,String key,String locale,String purpose){var f=files.get(key+":"+locale);check(f!=null&&f.purpose().equals(purpose));return f;}
    private static PublicMetadata metadata(Item i){return i.metadata()==null?PublicMetadataStore.empty():i.metadata();}
    private static List<Input> ordered(Map<String,Input> inputs){var result=new ArrayList<Input>();var pending=new ArrayList<>(inputs.values());pending.sort(Comparator.comparing((Input i)->i.item.key()).thenComparingInt(i->i.item.locale().equals("fr")?0:1));var done=new HashSet<String>();while(!pending.isEmpty()){boolean changed=false;for(var iterator=pending.iterator();iterator.hasNext();){var i=iterator.next();if(i.item.childKeys().stream().allMatch(done::contains)){result.add(i);done.add(i.item.key());iterator.remove();changed=true;}}check(changed);}return result;}
    private static ContentDocument withFiles(ContentDocument d,List<MediaReference> media,List<UUID> solutions){var e=d.exercise();return new ContentDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),e==null?null:new Exercise(e.instructions(),e.correction(),solutions),d.quiz(),d.rubric(),d.access(),media,d.relatedResourceIds(),d.methodDefinition(),d.quizPolicy(),d.projectPolicy());}
    private static String tag(ContentView v){return EntityTags.forRevision("content",v.id(),v.revision());}
    private static ItemResult result(Item i,ContentView v,String state){return new ItemResult(i.key(),i.locale(),state,v==null?null:v.id(),v==null?null:v.resourceId(),v==null?null:v.versionId(),v==null?null:v.currentRevisionId());}
    private static boolean key(String v,boolean slash){return v!=null&&v.matches(slash?"[a-z0-9][a-z0-9._/-]{0,99}":"[a-z0-9][a-z0-9._-]{0,99}");}
    private static Path resolve(Path root,String input)throws java.io.IOException{check(input!=null&&!Path.of(input).isAbsolute());Path path=root.resolve(input).normalize().toRealPath();check(path.startsWith(root)&&Files.isRegularFile(path));return path;}
    private static byte[] read(Path path,long max)throws java.io.IOException{check(Files.size(path)<=max);try(var in=Files.newInputStream(path)){byte[] bytes=in.readNBytes((int)max+1);check(bytes.length<=max);return bytes;}}
    private static byte[] hash(byte[] value){try{return MessageDigest.getInstance("SHA-256").digest(value);}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException();}}
    private <T> T decode(byte[] value,Class<T> type){return mapper.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(value);}
    private static ApiException conflict(){return new ApiException(ApiError.CONFLICT);}
}
