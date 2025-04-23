declare module 'node-quickbooks' {
  interface QuickBooksError {
    Fault: {
      Error: Array<{
        Message: string;
        Detail: string;
        code: string;
        element: string;
      }>;
    };
  }

  interface QueryResponse<T> {
    QueryResponse: {
      [key: string]: T[];
      maxResults: number;
      startPosition: number;
      totalCount: number;
    };
  }

  interface Customer {
    Id: string;
    SyncToken: string;
    DisplayName: string;
    PrimaryEmailAddr?: {
      Address: string;
    };
    PrimaryPhone?: {
      FreeFormNumber: string;
    };
    BillAddr?: {
      Line1: string;
      City: string;
      CountrySubDivisionCode: string;
      PostalCode: string;
    };
  }

  interface Invoice {
    Id: string;
    SyncToken: string;
    CustomerRef: {
      value: string;
    };
    TxnDate: string;
    DueDate?: string;
    Line: Array<{
      Description: string;
      Amount: number;
      DetailType: string;
      SalesItemLineDetail: {
        UnitPrice: number;
        Qty: number;
      };
    }>;
    CustomerMemo?: {
      value: string;
    };
    TotalAmt: number;
  }

  interface Payment {
    Id: string;
    CustomerRef: {
      value: string;
    };
    TotalAmt: number;
    PaymentMethodRef: {
      value: string;
    };
    LinkedTxn?: Array<{
      TxnId: string;
      TxnType: string;
    }>;
  }

  type QuickBooksCallback<T> = (error: QuickBooksError | null, data: T) => void;

  class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      accessToken: string,
      useSandbox: boolean,
      realmId: string,
      debug?: boolean,
      minorversion?: string | null,
      oauthversion?: string,
      refreshToken?: string
    );

    findCustomers(
      criteria: Array<{ field: string; value: string }>,
      callback: QuickBooksCallback<QueryResponse<Customer>>
    ): void;

    updateCustomer(
      customer: Customer,
      callback: QuickBooksCallback<Customer>
    ): void;

    createCustomer(
      customer: Partial<Customer>,
      callback: QuickBooksCallback<Customer>
    ): void;

    createInvoice(
      invoice: Partial<Invoice>,
      callback: QuickBooksCallback<Invoice>
    ): void;

    createPayment(
      payment: Partial<Payment>,
      callback: QuickBooksCallback<Payment>
    ): void;
  }

  export = QuickBooks;
}