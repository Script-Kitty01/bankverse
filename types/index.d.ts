/* eslint-disable no-unused-vars */

declare type SearchParamProps = {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

// ========================================

declare type SignUpParams = {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
  ssn: string;
  email: string;
  password: string;
};

declare type LoginUser = {
  email: string;
  password: string;
};

declare type User = {
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
  ssn: string;
};

declare type NewUserParams = {
  userId: string;
  email: string;
  name: string;
  password: string;
};

declare type Account = {
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

declare type Transaction = {
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

declare type Bank = {
  $id: string;
  accountId: string;
  bankId: string;
  accessToken: string;
  fundingSourceUrl: string;
  userId: string;
  sharableId: string;
};

declare type AccountTypes =
  | "depository"
  | "credit"
  | "loan"
  | "investment"
  | "other";

declare type Category = "Food and Drink" | "Travel" | "Transfer";

declare type CategoryCount = {
  name: string;
  count: number;
  totalCount: number;
};

declare type Receiver = {
  firstName: string;
  lastName: string;
};

declare type TransferParams = {
  sourceFundingSourceUrl: string;
  destinationFundingSourceUrl: string;
  amount: string;
};

declare type AddFundingSourceParams = {
  dwollaCustomerId: string;
};

// ========================================
// Razorpay Payment Types
// ========================================

declare type RazorpayOrderResponse = {
  success: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  error?: string;
};

declare type RazorpayVerifyResponse = {
  success: boolean;
  paymentId?: string;
  error?: string;
};

declare type PaymentRecord = {
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

declare type PaymentChannel =
  | "UPI"
  | "Card"
  | "Netbanking"
  | "Wallet"
  | "ACH"
  | "online"
  | "in store";

declare type NewDwollaCustomerParams = {
  firstName: string;
  lastName: string;
  email: string;
  type: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
  ssn: string;
};

declare interface CreditCardProps {
  account: Account;
  userName: string;
  showBalance?: boolean;
}

declare interface BankInfoProps {
  account: Account;
  appwriteItemId?: string;
  type: "full" | "card";
}

declare interface HeaderBoxProps {
  type?: "title" | "greeting";
  title: string;
  subtext: string;
  user?: string;
}

declare interface MobileNavProps {
  user: User;
}

declare interface PageHeaderProps {
  topTitle: string;
  bottomTitle: string;
  topDescription: string;
  bottomDescription: string;
  connectBank?: boolean;
}

declare interface PaginationProps {
  page: number;
  totalPages: number;
}

declare interface PlaidLinkProps {
  user: User;
  variant?: "primary" | "ghost";
  dwollaCustomerId?: string;
}

// declare type User = sdk.Models.Document & {
//   accountId: string;
//   email: string;
//   name: string;
//   items: string[];
//   accessToken: string;
//   image: string;
// };

declare interface AuthFormProps {
  type: "sign-in" | "sign-up";
}

declare interface BankDropdownProps {
  accounts: Account[];
  setValue?: UseFormSetValue<any>;
  otherStyles?: string;
}

declare interface BankTabItemProps {
  account: Account;
  appwriteItemId?: string;
}

declare interface TotalBalanceBoxProps {
  accounts: Account[];
  totalBanks: number;
  totalCurrentBalance: number;
}

declare interface FooterProps {
  user: User;
}

declare interface RightSidebarProps {
  user: User;
  transactions: Transaction[];
  banks: Account[] | (Bank & Account)[];
}

declare interface SidebarProps {
  user: User;
}

declare interface RecentTransactionsProps {
  accounts: Account[];
  transactions: Transaction[];
  appwriteItemId: string;
  page: number;
}

declare interface TransactionHistoryTableProps {
  transactions: Transaction[];
  page: number;
}

declare interface CategoryBadgeProps {
  category: string;
}

declare interface TransactionTableProps {
  transactions: Transaction[];
}

declare interface CategoryProps {
  category: CategoryCount;
}

declare interface DoughnutChartProps {
  accounts: Account[];
}

declare interface PaymentTransferFormProps {
  accounts: Account[];
}

// Actions
declare interface getAccountsProps {
  userId: string;
}

declare interface getAccountProps {
  appwriteItemId: string;
}

declare interface getInstitutionProps {
  institutionId: string;
}

declare interface getTransactionsProps {
  accessToken: string;
}

declare interface CreateFundingSourceOptions {
  customerId: string; // Dwolla Customer ID
  fundingSourceName: string; // Dwolla Funding Source Name
  plaidToken: string; // Plaid Account Processor Token
  _links: object; // Dwolla On Demand Authorization Link
}

declare interface CreateTransactionProps {
  name: string;
  amount: string;
  senderId: string;
  senderBankId: string;
  receiverId: string;
  receiverBankId: string;
  email: string;
}

declare interface getTransactionsByBankIdProps {
  bankId: string;
}

declare interface signInProps {
  email: string;
  password: string;
}

declare interface getUserInfoProps {
  userId: string;
}

declare interface exchangePublicTokenProps {
  publicToken: string;
  user: User;
}

declare interface createBankAccountProps {
  accessToken: string;
  userId: string;
  accountId: string;
  bankId: string;
  fundingSourceUrl: string;
  sharableId: string;
}

declare interface getBanksProps {
  userId: string;
}

declare interface getBankProps {
  documentId: string;
}

declare interface getBankByAccountIdProps {
  accountId: string;
}

// ========================================
// BankVerse — Payment Reliability Types
// ========================================

declare type LedgerEntryType = "DEBIT" | "CREDIT";

declare type PaymentState =
  | "CREATED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "UNKNOWN";

declare type SettlementState =
  | "NOT_REQUIRED"
  | "PENDING_RECONCILIATION"
  | "RECONCILING"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "RESOLVED"
  | "ESCALATED";

declare type MatchStatus = "MATCHED" | "MISMATCH";

declare type MismatchType =
  | "AMOUNT_MISMATCH"
  | "STATUS_MISMATCH"
  | "MISSING_PROVIDER_RECORD"
  | "MISSING_INTERNAL_RECORD"
  | "DUPLICATE_PROVIDER_RECORD"
  | "LEDGER_MISMATCH"
  | "DEBIT_WITHOUT_CREDIT";

declare type MatchMethod =
  | "exactReference"
  | "amountCurrency"
  | "amountCustomerTime";

declare type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

declare type IncidentStatus =
  | "DETECTED"
  | "INVESTIGATING"
  | "ACTION_REQUIRED"
  | "RESOLVED"
  | "DISMISSED";

declare interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: LedgerEntryType;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

declare interface LedgerAccount {
  id: string;
  userId: string;
  currency: string;
  totalDebits: number;
  totalCredits: number;
  derivedBalance: number;
  createdAt: string;
  updatedAt: string;
}

declare interface PaymentTransaction {
  id: string;
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  paymentState: PaymentState;
  settlementState: SettlementState;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

declare interface ReconciliationRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  recordsProcessed: number;
  matchedCount: number;
  mismatchCount: number;
}

declare interface ReconciliationItem {
  id: string;
  runId: string;
  transactionId: string;
  matchStatus: MatchStatus;
  mismatchType: MismatchType | null;
  evidence: ReconciliationEvidence | null;
  resolvedAt: string | null;
  resolution: string | null;
}

declare interface ReconciliationEvidence {
  internal: {
    status: string;
    amount: number;
    currency: string;
  };
  provider: {
    status: string;
    amount: number;
    currency: string;
  };
  ledger: {
    debit: number;
    credit: number;
    netSum: number;
  };
  matchedBy: MatchMethod | null;
  detectedAt: string;
}

declare interface PaymentIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  provider: string;
  affectedTransactionCount: number;
  totalAffectedAmount: number;
  mismatchTypes: string[];
  reconciliationItemIds: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

declare interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  severity: IncidentSeverity;
  expectedBehavior: string;
}

declare interface ChaosTestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  duration: number;
}

declare interface ChaosTestReport {
  scenariosRun: number;
  passed: number;
  failed: number;
  results: ChaosTestResult[];
  overallPassRate: number;
  generatedAt: string;
}
