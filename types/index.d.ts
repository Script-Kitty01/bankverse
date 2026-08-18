export {};

declare global {
  type SearchParamProps = {
    params: { [key: string]: string };
    searchParams: { [key: string]: string | string[] | undefined };
  };

  // ========================================

  type SignUpParams = {
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    dateOfBirth: string;
    pan: string;
    email: string;
    password: string;
  };

  type LoginUser = {
    email: string;
    password: string;
  };

  type User = {
    $id: string;
    email: string;
    userId: string;
    dwollaCustomerUrl: string;
    dwollaCustomerId: string;
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    dateOfBirth: string;
    pan: string;
  };

  type NewUserParams = {
    userId: string;
    email: string;
    name: string;
    password: string;
  };

  type Account = {
    id: string;
    availableBalance: number;
    currentBalance: number;
    officialName: string;
    mask: string;
    institutionId: string;
    name: string;
    type: string;
    subtype: string;
    appwriteItemId: string;
    sharableId: string;
  };

  type Transaction = {
    id: string;
    $id: string;
    name: string;
    paymentChannel: string;
    type: string;
    accountId: string;
    amount: number;
    pending: boolean;
    category: string;
    date: string;
    image: string;
    $createdAt: string;
    channel: string;
    senderBankId: string;
    receiverBankId: string;
  };

  type Bank = {
    $id: string;
    accountId: string;
    bankId: string;
    accessToken: string;
    fundingSourceUrl: string;
    userId: string;
    sharableId: string;
  };

  type AccountTypes = "depository" | "credit" | "loan" | "investment" | "other";

  type Category = "Food and Drink" | "Travel" | "Transfer";

  type CategoryCount = {
    name: string;
    count: number;
    totalCount: number;
  };

  type Receiver = {
    firstName: string;
    lastName: string;
  };

  type TransferParams = {
    sourceFundingSourceUrl: string;
    destinationFundingSourceUrl: string;
    amount: string;
  };

  type AddFundingSourceParams = {
    dwollaCustomerId: string;
  };

  // ========================================
  // Razorpay Payment Types
  // ========================================

  type RazorpayOrderResponse = {
    success: boolean;
    orderId?: string;
    amount?: number;
    currency?: string;
    error?: string;
  };

  type RazorpayVerifyResponse = {
    success: boolean;
    paymentId?: string;
    error?: string;
  };

  type PaymentRecord = {
    id: string;
    $id: string;
    userId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    amount: number;
    currency: string;
    status: "created" | "paid" | "failed";
    method: "upi" | "card" | "netbanking" | "wallet" | "other";
    description: string;
    createdAt: string;
  };

  type PaymentChannel =
    | "UPI"
    | "Card"
    | "Netbanking"
    | "Wallet"
    | "IMPS/NEFT"
    | "online"
    | "in store";

  type NewDwollaCustomerParams = {
    firstName: string;
    lastName: string;
    email: string;
    type: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    dateOfBirth: string;
    pan: string;
  };

  interface CreditCardProps {
    account: Account;
    userName: string;
    showBalance?: boolean;
  }

  interface BankInfoProps {
    account: Account;
    appwriteItemId?: string;
    type: "full" | "card";
  }

  interface HeaderBoxProps {
    type?: "title" | "greeting";
    title: string;
    subtext: string;
    user?: string;
  }

  interface MobileNavProps {
    user: User;
  }

  interface PageHeaderProps {
    topTitle: string;
    bottomTitle: string;
    topDescription: string;
    bottomDescription: string;
    connectBank?: boolean;
  }

  interface PaginationProps {
    page: number;
    totalPages: number;
  }

  interface PlaidLinkProps {
    user: User;
    variant?: "primary" | "ghost";
    dwollaCustomerId?: string;
  }

  interface AuthFormProps {
    type: "sign-in" | "sign-up";
  }

  interface BankDropdownProps {
    accounts: Account[];
    setValue?: UseFormSetValue<Record<string, unknown>>;
    otherStyles?: string;
  }

  interface BankTabItemProps {
    account: Account;
    appwriteItemId?: string;
  }

  interface TotalBalanceBoxProps {
    accounts: Account[];
    totalBanks: number;
    totalCurrentBalance: number;
  }

  interface FooterProps {
    user: User;
  }

  interface RightSidebarProps {
    user: User;
    transactions: Transaction[];
    banks: Account[] | (Bank & Account)[];
  }

  interface SidebarProps {
    user: User;
  }

  interface RecentTransactionsProps {
    accounts: Account[];
    transactions: Transaction[];
    appwriteItemId: string;
    page: number;
  }

  interface TransactionHistoryTableProps {
    transactions: Transaction[];
    page: number;
  }

  interface CategoryBadgeProps {
    category: string;
  }

  interface TransactionTableProps {
    transactions: Transaction[];
  }

  interface CategoryProps {
    category: CategoryCount;
  }

  interface DoughnutChartProps {
    accounts: Account[];
  }

  interface PaymentTransferFormProps {
    accounts: Account[];
  }

  // Actions
  interface getAccountsProps {
    userId: string;
  }

  interface getAccountProps {
    appwriteItemId: string;
  }

  interface getInstitutionProps {
    institutionId: string;
  }

  interface getTransactionsProps {
    accessToken: string;
  }

  interface CreateFundingSourceOptions {
    customerId: string;
    fundingSourceName: string;
    plaidToken: string;
    _links: object;
  }

  interface CreateTransactionProps {
    name: string;
    amount: string;
    senderId: string;
    senderBankId: string;
    receiverId: string;
    receiverBankId: string;
    email: string;
  }

  interface getTransactionsByBankIdProps {
    bankId: string;
  }

  interface exchangePublicTokenProps {
    publicToken: string;
    user: User;
  }

  interface signInProps {
    email: string;
    password: string;
  }

  interface getUserInfoProps {
    userId: string;
  }

  // URL Query Params
  interface UrlQueryParams {
    params: string;
    key: string;
    value: string;
  }

  interface RemoveUrlQueryParams {
    params: string;
    keysToRemove: string[];
  }

  // Incident Severity (used by chaos lab)
  type IncidentSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}
