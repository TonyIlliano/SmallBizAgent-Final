declare module 'intuit-oauth' {
  interface OAuthClientOptions {
    clientId: string;
    clientSecret: string;
    environment: string;
    redirectUri: string;
  }

  interface AuthorizeOptions {
    scope: string[];
    state: string;
  }

  interface OAuthToken {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    state: string;
    realmId: string;
  }

  interface TokenResponse {
    getJson(): OAuthToken;
  }

  class OAuthClient {
    constructor(options: OAuthClientOptions);
    
    static scopes: {
      Accounting: string;
      Payment: string;
      Payroll: string;
      TimeTracking: string;
      Benefits: string;
      Profile: string;
      Email: string;
      Phone: string;
      Address: string;
      OpenId: string;
    };

    authorizeUri(options: AuthorizeOptions): string;
    createToken(url: string): Promise<TokenResponse>;
    refresh(): Promise<TokenResponse>;
    setToken(token: { refresh_token: string, access_token: string }): void;
  }

  export = OAuthClient;
}