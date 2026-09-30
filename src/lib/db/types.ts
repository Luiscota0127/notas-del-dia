export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Generado a mano desde las migraciones: 0001_init.sql y 0005_agendas.sql.
 *
 * `Relationships` es obligatorio en postgrest-js v2; sin él, los tipos de
 * Insert/Update colapsan a `never[]`. Si cambia el schema, regenerar con
 * `npx supabase gen types typescript --local`.
 */
export type Database = {
  public: {
    Tables: {
      lista: {
        Row: {
          id: string;
          agenda_id: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agenda_id: string;
          body?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lista_agenda_id_fkey";
            columns: ["agenda_id"];
            isOneToOne: false;
            referencedRelation: "agendas";
            referencedColumns: ["id"];
          },
        ];
      };
      agendas: {
        Row: {
          id: string;
          name: string;
          color: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agenda_miembros: {
        Row: {
          agenda_id: string;
          profile_id: string;
          rol: "dueno" | "miembro";
          joined_at: string;
        };
        Insert: {
          agenda_id: string;
          profile_id: string;
          rol?: "dueno" | "miembro";
          joined_at?: string;
        };
        Update: {
          rol?: "dueno" | "miembro";
        };
        Relationships: [
          {
            foreignKeyName: "agenda_miembros_agenda_id_fkey";
            columns: ["agenda_id"];
            isOneToOne: false;
            referencedRelation: "agendas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agenda_miembros_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agenda_invitaciones: {
        Row: {
          id: string;
          agenda_id: string;
          email: string;
          invited_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agenda_id: string;
          email: string;
          invited_by: string;
          created_at?: string;
        };
        Update: Record<never, never>;
        Relationships: [
          {
            foreignKeyName: "agenda_invitaciones_agenda_id_fkey";
            columns: ["agenda_id"];
            isOneToOne: false;
            referencedRelation: "agendas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agenda_invitaciones_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
          agenda_id: string;
          date: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agenda_id: string;
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
            foreignKeyName: "notes_agenda_id_fkey";
            columns: ["agenda_id"];
            isOneToOne: false;
            referencedRelation: "agendas";
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
export type Agenda = Database["public"]["Tables"]["agendas"]["Row"];
export type Miembro = Database["public"]["Tables"]["agenda_miembros"]["Row"];
export type Invitacion = Database["public"]["Tables"]["agenda_invitaciones"]["Row"];
