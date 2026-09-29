export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Generado a mano desde supabase/migrations/0001_init.sql.
 *
 * `Relationships` es obligatorio en postgrest-js v2; sin él, los tipos de
 * Insert/Update colapsan a `never[]`. Si cambia el schema, regenerar con
 * `npx supabase gen types typescript --local`.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          color: string;
          notify: "all" | "mine" | "none";
          notified: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          color?: string;
          notify?: "all" | "mine" | "none";
          notified?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
          notify?: "all" | "mine" | "none";
          notified?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          body?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Note = Database["public"]["Tables"]["notes"]["Row"];
