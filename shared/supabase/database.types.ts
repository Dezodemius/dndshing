export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      folders: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          game_date: string | null;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          game_date?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          game_date?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          folder_id: string;
          player_name: string;
          character_name: string;
          race: string;
          class: string;
          level: number;
          gender: string | null;
          short_backstory: string;
          appearance: string;
          personality: string;
          fears: string;
          goals: string;
          avatar_url: string | null;
          raw_prompt: string;
          internal_json: Json;
          generated_json: Json;
          generated_json_path: string | null;
          pdf_path: string | null;
          processing_status: string;
          processing_steps: Json;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          folder_id: string;
          player_name: string;
          character_name: string;
          race: string;
          class: string;
          level: number;
          gender?: string | null;
          short_backstory: string;
          appearance: string;
          personality: string;
          fears: string;
          goals: string;
          avatar_url?: string | null;
          raw_prompt: string;
          internal_json: Json;
          generated_json: Json;
          generated_json_path?: string | null;
          pdf_path?: string | null;
          processing_status?: string;
          processing_steps?: Json;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          folder_id?: string;
          player_name?: string;
          character_name?: string;
          race?: string;
          class?: string;
          level?: number;
          gender?: string | null;
          short_backstory?: string;
          appearance?: string;
          personality?: string;
          fears?: string;
          goals?: string;
          avatar_url?: string | null;
          raw_prompt?: string;
          internal_json?: Json;
          generated_json?: Json;
          generated_json_path?: string | null;
          pdf_path?: string | null;
          processing_status?: string;
          processing_steps?: Json;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "characters_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          }
        ];
      };
      user_ai_settings: {
        Row: {
          user_id: string;
          api_base_url: string;
          api_key: string;
          model_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          api_base_url: string;
          api_key: string;
          model_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          api_base_url?: string;
          api_key?: string;
          model_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
