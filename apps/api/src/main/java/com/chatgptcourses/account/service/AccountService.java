package com.chatgptcourses.account.service;

import static com.chatgptcourses.account.service.AccountOperations.*;
import static com.chatgptcourses.account.service.AccountTypes.*;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.util.*;
import java.sql.Timestamp;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    private final AccountOperations db;private final IdentityService identities;
    public AccountService(AccountOperations db,IdentityService identities){this.db=db;this.identities=identities;}
    public ProfileView profile(UUID actor){return identities.profile(actor);}
    public ProfileView saveProfile(UUID actor,UUID context,String ifMatch,SaveProfile command){check(command!=null);return identities.updateProfile(actor,context,ifMatch,command.displayName());}
    @Transactional(readOnly=true)
    public CommercialDocuments commercialDocuments(UUID actor,UUID order){db.authorization.require(actor,"commerce.orders.read");if(!Boolean.TRUE.equals(db.jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM orders WHERE id=? AND owner_id=?)",Boolean.class,order,actor)))throw error(ApiError.RESOURCE_NOT_FOUND);return new CommercialDocuments(order,"NONE_AVAILABLE",List.of(),"NO_VERIFIED_COMMERCIAL_DOCUMENT");}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public DataRequestPage listDataRequests(UUID actor,int page,int size){db.authorization.require(actor,"account.data.read");page(page,size);long total=db.jdbc.queryForObject("SELECT count(*) FROM account_data_requests WHERE owner_id=?",Long.class,actor);var ids=db.jdbc.query("SELECT id FROM account_data_requests WHERE owner_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",(r,n)->r.getObject(1,UUID.class),actor,size,(long)page*size);return new DataRequestPage(ids.stream().map(id->row(actor,id,false)).toList(),page,size,total);}
    @Transactional
    public DataRequestCreation createDataRequest(UUID actor,UUID context,String idempotencyKey,CreateDataRequest command){db.authorization.mutation(actor,context,"account.data.write");check(command!=null&&command.type()!=null&&Set.of("EXPORT","ERASURE","ACCOUNT_CLOSURE").contains(command.type()));text(command.reason(),2000);UUID key=key(idempotencyKey);byte[] hash=db.hash(command);db.lock(actor);db.authorization.mutation(actor,context,"account.data.write");UUID old=db.replay(actor,"DATA_CREATE",key,hash);if(old!=null)return new DataRequestCreation(row(actor,old,false),false);if(Boolean.TRUE.equals(db.jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM account_data_requests WHERE owner_id=? AND request_type=? AND state='WAITING_POLICY')",Boolean.class,actor,command.type())))throw error(ApiError.DATA_REQUEST_EXISTS);UUID id=UUID.randomUUID();var stamp=clock();db.jdbc.update("INSERT INTO account_data_requests(id,owner_id,request_type,reason,state,created_at,updated_at) VALUES(?,?,?,?,'WAITING_POLICY',?,?)",id,actor,command.type(),command.reason(),stamp,stamp);event(id,actor,"REQUESTED",command.reason(),stamp);db.remember(actor,"DATA_CREATE",key,hash,"data_request_id",id);return new DataRequestCreation(row(actor,id,false),true);}
    @Transactional(readOnly=true)
    public DataRequestView dataRequest(UUID actor,UUID id){db.authorization.require(actor,"account.data.read");return row(actor,id,false);}
    @Transactional
    public DataRequestView cancelDataRequest(UUID actor,UUID context,UUID id,String ifMatch,String idempotencyKey,CancelDataRequest command){db.authorization.mutation(actor,context,"account.data.write");check(command!=null);text(command.reason(),2000);UUID key=key(idempotencyKey);byte[] hash=db.hash(Arrays.asList(id,command));row(actor,id,false);db.lock(actor);var current=row(actor,id,true);db.authorization.mutation(actor,context,"account.data.write");if(db.replay(actor,"DATA_CANCEL",key,hash)!=null)return current;RevisionPreconditions.requireMatch(ifMatch,tag(current));if(!"WAITING_POLICY".equals(current.state()))throw error(ApiError.DATA_REQUEST_NOT_CANCELLABLE);var stamp=requestStamp(id);db.jdbc.update("UPDATE account_data_requests SET state='CANCELLED',cancelled_at=?,updated_at=?,revision=revision+1 WHERE id=?",stamp,stamp,id);event(id,actor,"CANCELLED",command.reason(),stamp);db.remember(actor,"DATA_CANCEL",key,hash,"data_request_id",id);return row(actor,id,false);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public DataRequestEventPage dataRequestEvents(UUID actor,UUID id,int page,int size){db.authorization.require(actor,"account.data.read");row(actor,id,false);page(page,size);long total=db.jdbc.queryForObject("SELECT count(*) FROM account_data_request_events WHERE request_id=?",Long.class,id);var items=db.jdbc.query("SELECT * FROM account_data_request_events WHERE request_id=? ORDER BY CASE event_type WHEN 'REQUESTED' THEN 0 WHEN 'CANCELLED' THEN 1 END,created_at,id LIMIT ? OFFSET ?",(r,n)->new DataRequestEvent(r.getObject("id",UUID.class),id,r.getString("event_type"),r.getString("reason"),instant(r,"created_at")),id,size,(long)page*size);return new DataRequestEventPage(items,page,size,total);}
    private DataRequestView row(UUID actor,UUID id,boolean lock){var rows=db.jdbc.query("SELECT * FROM account_data_requests WHERE id=? AND owner_id=?"+(lock?" FOR UPDATE":""),(r,n)->new DataRequestView(id,r.getLong("revision"),r.getString("request_type"),r.getString("reason"),r.getString("state"),"WAITING_POLICY".equals(r.getString("state"))?"RETENTION_POLICY_UNCONFIGURED":null,instant(r,"created_at"),instant(r,"updated_at"),instant(r,"cancelled_at")),id,actor);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    private void event(UUID id,UUID actor,String type,String reason,Timestamp stamp){db.jdbc.update("INSERT INTO account_data_request_events(id,request_id,owner_id,event_type,reason,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),id,actor,type,reason,stamp);}
    private Timestamp clock(){return db.jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class);}
    // The parent lock is held; one database instant is shared by the row and its append-only event.
    private Timestamp requestStamp(UUID id){return db.jdbc.queryForObject("SELECT greatest(clock_timestamp(),r.created_at,r.updated_at+interval '1 microsecond',coalesce((SELECT max(e.created_at)+interval '1 microsecond' FROM account_data_request_events e WHERE e.request_id=r.id),r.created_at)) FROM account_data_requests r WHERE r.id=?",Timestamp.class,id);}
    public static String tag(DataRequestView value){return EntityTags.forRevision("data-request",value.id(),value.revision());}
}
