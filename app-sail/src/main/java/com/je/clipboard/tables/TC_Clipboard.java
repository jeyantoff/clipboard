package com.je.clipboard.tables;

import com.zc.common.ZCProject;
import com.zoho.services.catalyst.table.Column;
import com.zoho.services.catalyst.table.PK1Table;
import com.zoho.services.catalyst.table.RowInterface;
import com.zoho.services.catalyst.table.anno.PrimaryKey;
import com.zoho.services.catalyst.table.anno.Varchar;
import lombok.Builder;
import lombok.NonNull;
import lombok.Value;
import lombok.experimental.Accessors;
import lombok.extern.jackson.Jacksonized;

import java.time.LocalDateTime;
import java.util.List;

public class TC_Clipboard extends PK1Table<TC_Clipboard.Row, TC_Clipboard.Row.RowBuilder, String>
{
    public final SearchIn search = new SearchIn();
    
    public TC_Clipboard(ZCProject project)
    {
        super(project, Row.class, Row.RowBuilder.class);
    }
    
    @Override
    public Row.RowBuilder newRow()
    {
        return Row.builder().table(this);
    }
    
    @Override
    public @NonNull SyncType syncType()
    {
        return SyncType.HARD_SYNC;
    }
    
    @Override
    public Long tableId()
    {
        return 4823000010969941L;
    }
    
    public class SearchIn extends PK1Table<Row, Row.RowBuilder, String>.SearchIn
    {
        public Row withMail(String userMail)
        {
            var query = TC_Clipboard.this.select()
                                        .criteria("C_USER_ID = '" + userId + "' AND C_NAME = '" + assistantName + "' AND C_FEATURE = '" + feature + "'");
            var rows = query.execute();
            
            if(rows==null || rows.isEmpty())
            {
                return null;
            }
            return rows.get(0);
        }
        
        public List<TC_Clipboard.Row> withConversationNameStarts(String userMail)
        {
            var query = TC_Clipboard.this.select()
                                           .criteria("C_USER_EMAIL='" + userMail + "'");
            var rows = query.execute();
            
            if(rows==null || rows.isEmpty())
            {
                return List.of();
            }
            return rows;
        }
    }
    
    @Value
    @Builder
    @Accessors(fluent = true)
    @Jacksonized
    public static class Row implements RowInterface<Row, Row.RowBuilder>
    {
        @Column Long ROWID;
        @Column Long CREATORID;
        @Column LocalDateTime CREATEDTIME;
        @Column LocalDateTime MODIFIEDTIME;
        
        @Column @PrimaryKey @Varchar String C_ID;
        @Column @Varchar String C_NAME;
        @Column @Varchar String C_USER_EMAIL;
        @Column String C_CONTENT;
        
        TC_Clipboard table;
        
        public Row(Long ROWID,
                   Long CREATORID,
                   LocalDateTime CREATEDTIME,
                   LocalDateTime MODIFIEDTIME,
                   String C_ID,
                   String C_NAME,
                   String C_USER_EMAIL,
                   String C_CONTENT,
                   TC_Clipboard table)
        {
            this.ROWID = ROWID;
            this.CREATORID = CREATORID;
            this.CREATEDTIME = CREATEDTIME;
            this.MODIFIEDTIME = MODIFIEDTIME;
            
            this.C_ID = C_ID;
            this.C_NAME = C_NAME;
            this.C_USER_EMAIL = C_USER_EMAIL;
            this.C_CONTENT = C_CONTENT;
            
            this.table = table;
        }
    }
}
