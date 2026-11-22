package com.chatgptcourses;

import com.chatgptcourses.commerce.service.CommerceTypes.OfferView;
import com.chatgptcourses.editorial.service.ContentTypes.ContentView;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Opt-in setup for isolated tests explicitly modelling an approved editorial storefront. */
final class DiscoveryTestSelections {
    private DiscoveryTestSelections() { }
    static ContentView editorial(JdbcTemplate jdbc,ContentView content){approveRevision(jdbc,content.publishedRevisionId());return content;}
    static void approveRevision(JdbcTemplate jdbc,UUID revision){
        jdbc.update("""
            INSERT INTO editorial_public_selections(revision_id,selection_revision,provenance,approved,actor_id,reason)
            SELECT e.id,coalesce((SELECT max(s.selection_revision) FROM editorial_public_selections s WHERE s.revision_id=e.id),0)+1,
              'EDITORIAL',true,e.author_id,'Explicit isolated approved editorial discovery fixture'
            FROM editorial_revisions e WHERE e.id=?
            """,revision);
    }
    static void approveTree(JdbcTemplate jdbc,UUID version){
        for(UUID revision:jdbc.queryForList("""
            WITH RECURSIVE tree(id) AS(SELECT ?::uuid UNION SELECT c.child_version_id FROM version_compositions c JOIN tree p ON p.id=c.parent_version_id)
            SELECT t.published_revision_id FROM tree JOIN content_translations t ON t.pedagogical_version_id=tree.id WHERE t.published_revision_id IS NOT NULL
            """,UUID.class,version))approveRevision(jdbc,revision);
    }
    static void offer(JdbcTemplate jdbc,OfferView offer){
        for(var included:offer.fields().resources())approveTree(jdbc,included.versionId());
        jdbc.update("""
            INSERT INTO offer_public_selections(revision_id,selection_revision,provenance,approved,actor_id,reason)
            SELECT id,1,'EDITORIAL',true,author_id,'Explicit isolated approved offer discovery fixture' FROM offer_revisions WHERE id=?
            """,offer.currentRevisionId());
    }
}
