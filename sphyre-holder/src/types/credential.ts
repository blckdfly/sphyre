export interface CredentialAttribute {
    key: string;
    value: string | number | boolean | null;
  }
  
  export interface Credential {
    id: string;
    credential_type: string;
    issuer_name?: string;
    issuer_did: string;
    issuance_date: string;
    expiration_date?: string;
    credential_data: Record<string, unknown>;
    status?: string;
  }