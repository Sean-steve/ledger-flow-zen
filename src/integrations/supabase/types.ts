export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allocations: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          id: string
          invoice_id: string
          payment_id: string | null
          reversed_at: string | null
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          invoice_id: string
          payment_id?: string | null
          reversed_at?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string | null
          reversed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          business_id: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          business_id: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          business_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          bank_swift: string | null
          base_currency: string
          city: string | null
          country: string
          created_at: string
          default_legal_terms: string | null
          default_notes: string | null
          default_tax_category: Database["public"]["Enums"]["tax_category"]
          default_template: string
          default_terms_days: number
          default_wht_rate: number
          email: string | null
          id: string
          kra_pin: string | null
          logo_path: string | null
          mpesa_account_format: string | null
          mpesa_paybill: string | null
          name: string
          owner_id: string
          phone: string | null
          physical_address: string | null
          postal_address: string | null
          seal_path: string | null
          signatory_name: string | null
          signatory_title: string | null
          signature_path: string | null
          trading_name: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          base_currency?: string
          city?: string | null
          country?: string
          created_at?: string
          default_legal_terms?: string | null
          default_notes?: string | null
          default_tax_category?: Database["public"]["Enums"]["tax_category"]
          default_template?: string
          default_terms_days?: number
          default_wht_rate?: number
          email?: string | null
          id?: string
          kra_pin?: string | null
          logo_path?: string | null
          mpesa_account_format?: string | null
          mpesa_paybill?: string | null
          name: string
          owner_id?: string
          phone?: string | null
          physical_address?: string | null
          postal_address?: string | null
          seal_path?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          signature_path?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          base_currency?: string
          city?: string | null
          country?: string
          created_at?: string
          default_legal_terms?: string | null
          default_notes?: string | null
          default_tax_category?: Database["public"]["Enums"]["tax_category"]
          default_template?: string
          default_terms_days?: number
          default_wht_rate?: number
          email?: string | null
          id?: string
          kra_pin?: string | null
          logo_path?: string | null
          mpesa_account_format?: string | null
          mpesa_paybill?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          physical_address?: string | null
          postal_address?: string | null
          seal_path?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          signature_path?: string | null
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          contact_person: string | null
          country: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          currency: string
          email: string | null
          id: string
          kra_pin: string | null
          name: string
          notes: string | null
          payment_terms_days: number
          phone: string | null
          status: Database["public"]["Enums"]["client_state"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string
          email?: string | null
          id?: string
          kra_pin?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["client_state"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          currency?: string
          email?: string | null
          id?: string
          kra_pin?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["client_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_items: {
        Row: {
          created_at: string
          description: string
          discount_amount: number
          discount_pct: number
          document_id: string
          gross_amount: number
          id: string
          net_amount: number
          position: number
          quantity: number
          tax_amount: number
          tax_category: Database["public"]["Enums"]["tax_category"]
          tax_rate: number
          taxable_amount: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_amount?: number
          discount_pct?: number
          document_id: string
          gross_amount?: number
          id?: string
          net_amount?: number
          position?: number
          quantity?: number
          tax_amount?: number
          tax_category?: Database["public"]["Enums"]["tax_category"]
          tax_rate?: number
          taxable_amount?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_amount?: number
          discount_pct?: number
          document_id?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          position?: number
          quantity?: number
          tax_amount?: number
          tax_category?: Database["public"]["Enums"]["tax_category"]
          tax_rate?: number
          taxable_amount?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          business_id: string
          last_value: number
          prefix: string
          year: number
        }
        Insert: {
          business_id: string
          last_value?: number
          prefix: string
          year: number
        }
        Update: {
          business_id?: string
          last_value?: number
          prefix?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          reason: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          reason?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          reason?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      documents: {
        Row: {
          business_id: string
          client_address: string | null
          client_email: string | null
          client_id: string
          client_kra_pin: string | null
          client_name: string
          converted_to_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          doc_number: string | null
          due_date: string | null
          exchange_rate: number
          finalized_at: string | null
          first_viewed_at: string | null
          id: string
          issue_date: string
          kra_control_code: string | null
          kra_status: string
          kra_transmitted_at: string | null
          legal_terms: string | null
          notes: string | null
          parent_document_id: string | null
          payment_terms_days: number
          reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal: number
          tax_breakdown: Json
          tax_total: number
          taxable_total: number
          template_id: string
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          valid_until: string | null
          version: number
          voided_at: string | null
          wht_amount: number
          wht_applicable: boolean
          wht_rate: number
        }
        Insert: {
          business_id: string
          client_address?: string | null
          client_email?: string | null
          client_id: string
          client_kra_pin?: string | null
          client_name: string
          converted_to_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          doc_number?: string | null
          due_date?: string | null
          exchange_rate?: number
          finalized_at?: string | null
          first_viewed_at?: string | null
          id?: string
          issue_date?: string
          kra_control_code?: string | null
          kra_status?: string
          kra_transmitted_at?: string | null
          legal_terms?: string | null
          notes?: string | null
          parent_document_id?: string | null
          payment_terms_days?: number
          reason?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal?: number
          tax_breakdown?: Json
          tax_total?: number
          taxable_total?: number
          template_id?: string
          total_amount?: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          valid_until?: string | null
          version?: number
          voided_at?: string | null
          wht_amount?: number
          wht_applicable?: boolean
          wht_rate?: number
        }
        Update: {
          business_id?: string
          client_address?: string | null
          client_email?: string | null
          client_id?: string
          client_kra_pin?: string | null
          client_name?: string
          converted_to_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          doc_number?: string | null
          due_date?: string | null
          exchange_rate?: number
          finalized_at?: string | null
          first_viewed_at?: string | null
          id?: string
          issue_date?: string
          kra_control_code?: string | null
          kra_status?: string
          kra_transmitted_at?: string | null
          legal_terms?: string | null
          notes?: string | null
          parent_document_id?: string | null
          payment_terms_days?: number
          reason?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal?: number
          tax_breakdown?: Json
          tax_total?: number
          taxable_total?: number
          template_id?: string
          total_amount?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          valid_until?: string | null
          version?: number
          voided_at?: string | null
          wht_amount?: number
          wht_applicable?: boolean
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_balances"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_converted_to_id_fkey"
            columns: ["converted_to_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_converted_to_id_fkey"
            columns: ["converted_to_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          as_of_date: string
          business_id: string
          created_at: string
          currency: string
          id: string
          rate_to_base: number
          source: string
        }
        Insert: {
          as_of_date?: string
          business_id: string
          created_at?: string
          currency: string
          id?: string
          rate_to_base: number
          source?: string
        }
        Update: {
          as_of_date?: string
          business_id?: string
          created_at?: string
          currency?: string
          id?: string
          rate_to_base?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          business_id: string
          channel: Database["public"]["Enums"]["payment_channel"]
          channel_txn_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          id: string
          notes: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_date: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          status: Database["public"]["Enums"]["payment_state"]
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          channel: Database["public"]["Enums"]["payment_channel"]
          channel_txn_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          channel?: Database["public"]["Enums"]["payment_channel"]
          channel_txn_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_balances"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          id: string
          notes: string | null
          payment_id: string
          receipt_number: string
          received_by: string | null
          template_id: string
          voided_at: string | null
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_id: string
          receipt_number: string
          received_by?: string | null
          template_id?: string
          voided_at?: string | null
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_id?: string
          receipt_number?: string
          received_by?: string | null
          template_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_balances"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          expires_at: string | null
          id: string
          last_seen_at: string | null
          receipt_id: string | null
          revoked_at: string | null
          token: string
          view_count: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string | null
          receipt_id?: string | null
          revoked_at?: string | null
          token: string
          view_count?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string | null
          receipt_id?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "invoice_ledger"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "share_links_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_balances: {
        Row: {
          business_id: string | null
          client_id: string | null
          credited: number | null
          currency: string | null
          invoiced: number | null
          name: string | null
          outstanding: number | null
          overdue: number | null
          paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_ledger: {
        Row: {
          amount_due: number | null
          balance: number | null
          business_id: string | null
          client_id: string | null
          client_name: string | null
          credited_amount: number | null
          currency: string | null
          days_overdue: number | null
          doc_number: string | null
          due_date: string | null
          invoice_id: string | null
          issue_date: string | null
          paid_amount: number | null
          payment_status: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"] | null
          total_amount: number | null
          wht_withheld: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_balances"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_write_business: { Args: { _business_id: string }; Returns: boolean }
      convert_document: {
        Args: {
          _source_id: string
          _target_type: Database["public"]["Enums"]["doc_type"]
        }
        Returns: {
          business_id: string
          client_address: string | null
          client_email: string | null
          client_id: string
          client_kra_pin: string | null
          client_name: string
          converted_to_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          doc_number: string | null
          due_date: string | null
          exchange_rate: number
          finalized_at: string | null
          first_viewed_at: string | null
          id: string
          issue_date: string
          kra_control_code: string | null
          kra_status: string
          kra_transmitted_at: string | null
          legal_terms: string | null
          notes: string | null
          parent_document_id: string | null
          payment_terms_days: number
          reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal: number
          tax_breakdown: Json
          tax_total: number
          taxable_total: number
          template_id: string
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          valid_until: string | null
          version: number
          voided_at: string | null
          wht_amount: number
          wht_applicable: boolean
          wht_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_business: {
        Args: { _base_currency?: string; _name: string }
        Returns: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          bank_swift: string | null
          base_currency: string
          city: string | null
          country: string
          created_at: string
          default_legal_terms: string | null
          default_notes: string | null
          default_tax_category: Database["public"]["Enums"]["tax_category"]
          default_template: string
          default_terms_days: number
          default_wht_rate: number
          email: string | null
          id: string
          kra_pin: string | null
          logo_path: string | null
          mpesa_account_format: string | null
          mpesa_paybill: string | null
          name: string
          owner_id: string
          phone: string | null
          physical_address: string | null
          postal_address: string | null
          seal_path: string | null
          signatory_name: string | null
          signatory_title: string | null
          signature_path: string | null
          trading_name: string | null
          updated_at: string
          vat_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "businesses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_document: {
        Args: { _document_id: string }
        Returns: {
          business_id: string
          client_address: string | null
          client_email: string | null
          client_id: string
          client_kra_pin: string | null
          client_name: string
          converted_to_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          doc_number: string | null
          due_date: string | null
          exchange_rate: number
          finalized_at: string | null
          first_viewed_at: string | null
          id: string
          issue_date: string
          kra_control_code: string | null
          kra_status: string
          kra_transmitted_at: string | null
          legal_terms: string | null
          notes: string | null
          parent_document_id: string | null
          payment_terms_days: number
          reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal: number
          tax_breakdown: Json
          tax_total: number
          taxable_total: number
          template_id: string
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          valid_until: string | null
          version: number
          voided_at: string | null
          wht_amount: number
          wht_applicable: boolean
          wht_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_shared_document: { Args: { _token: string }; Returns: Json }
      has_business_access: { Args: { _business_id: string }; Returns: boolean }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["member_role"][]
        }
        Returns: boolean
      }
      issue_credit_note: {
        Args: { _credit_note_id: string }
        Returns: {
          business_id: string
          client_address: string | null
          client_email: string | null
          client_id: string
          client_kra_pin: string | null
          client_name: string
          converted_to_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          doc_number: string | null
          due_date: string | null
          exchange_rate: number
          finalized_at: string | null
          first_viewed_at: string | null
          id: string
          issue_date: string
          kra_control_code: string | null
          kra_status: string
          kra_transmitted_at: string | null
          legal_terms: string | null
          notes: string | null
          parent_document_id: string | null
          payment_terms_days: number
          reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal: number
          tax_breakdown: Json
          tax_total: number
          taxable_total: number
          template_id: string
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          valid_until: string | null
          version: number
          voided_at: string | null
          wht_amount: number
          wht_applicable: boolean
          wht_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_document_number: {
        Args: { _business_id: string; _prefix: string }
        Returns: string
      }
      recalculate_document: {
        Args: { _document_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          _allocations?: Json
          _amount: number
          _business_id: string
          _channel: Database["public"]["Enums"]["payment_channel"]
          _channel_txn_id?: string
          _client_id: string
          _currency?: string
          _notes?: string
          _payer_name?: string
          _payer_phone?: string
          _payment_date?: string
          _reference?: string
        }
        Returns: Json
      }
      reverse_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: {
          amount: number
          business_id: string
          channel: Database["public"]["Enums"]["payment_channel"]
          channel_txn_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          exchange_rate: number
          id: string
          notes: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_date: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          status: Database["public"]["Enums"]["payment_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_document: {
        Args: { _document_id: string; _reason: string }
        Returns: {
          business_id: string
          client_address: string | null
          client_email: string | null
          client_id: string
          client_kra_pin: string | null
          client_name: string
          converted_to_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          doc_number: string | null
          due_date: string | null
          exchange_rate: number
          finalized_at: string | null
          first_viewed_at: string | null
          id: string
          issue_date: string
          kra_control_code: string | null
          kra_status: string
          kra_transmitted_at: string | null
          legal_terms: string | null
          notes: string | null
          parent_document_id: string | null
          payment_terms_days: number
          reason: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["doc_lifecycle"]
          subtotal: number
          tax_breakdown: Json
          tax_total: number
          taxable_total: number
          template_id: string
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          valid_until: string | null
          version: number
          voided_at: string | null
          wht_amount: number
          wht_applicable: boolean
          wht_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      client_state: "ACTIVE" | "ON_HOLD" | "INACTIVE"
      doc_lifecycle:
        | "DRAFT"
        | "ISSUED"
        | "ACCEPTED"
        | "REJECTED"
        | "EXPIRED"
        | "CONVERTED"
        | "VOID"
        | "CANCELLED"
      doc_type:
        | "INVOICE"
        | "PRO_FORMA"
        | "QUOTATION"
        | "CREDIT_NOTE"
        | "DEBIT_NOTE"
      member_role: "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER"
      payment_channel:
        | "MPESA_C2B"
        | "MPESA_TILL"
        | "BANK_TRANSFER"
        | "RTGS"
        | "CASH"
        | "CHEQUE"
        | "CARD"
        | "OTHER"
      payment_state:
        | "INITIATED"
        | "COMPLETED"
        | "RECONCILED"
        | "FAILED"
        | "REVERSED"
      tax_category: "VAT_16" | "VAT_8" | "ZERO_RATED" | "EXEMPT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      client_state: ["ACTIVE", "ON_HOLD", "INACTIVE"],
      doc_lifecycle: [
        "DRAFT",
        "ISSUED",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
        "CONVERTED",
        "VOID",
        "CANCELLED",
      ],
      doc_type: [
        "INVOICE",
        "PRO_FORMA",
        "QUOTATION",
        "CREDIT_NOTE",
        "DEBIT_NOTE",
      ],
      member_role: ["OWNER", "ADMIN", "ACCOUNTANT", "VIEWER"],
      payment_channel: [
        "MPESA_C2B",
        "MPESA_TILL",
        "BANK_TRANSFER",
        "RTGS",
        "CASH",
        "CHEQUE",
        "CARD",
        "OTHER",
      ],
      payment_state: [
        "INITIATED",
        "COMPLETED",
        "RECONCILED",
        "FAILED",
        "REVERSED",
      ],
      tax_category: ["VAT_16", "VAT_8", "ZERO_RATED", "EXEMPT"],
    },
  },
} as const
