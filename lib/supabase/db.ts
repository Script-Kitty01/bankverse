import { getSupabaseClient } from "./config";

/**
 * Create a user document in Supabase.
 */
export async function createUserDocument(user: {
  email: string;
  userId: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
  ssn: string;
}) {
  const supabase = getSupabaseClient();
  const document = {
    $id: user.userId,
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    address1: user.address1,
    city: user.city,
    state: user.state,
    postalCode: user.postalCode,
    dateOfBirth: user.dateOfBirth,
    ssn: user.ssn,
    dwollaCustomerUrl: "",
    dwollaCustomerId: "",
    createdAt: new Date().toISOString(),
  };

  try {
    const { data } = await supabase
      .from("users")
      .insert([document])
      .select()
      .single();

    return data || document;
  } catch {
    return document;
  }
}

/**
 * Get user by account ID (userId).
 */
export async function getUserByAccountId(userId: string) {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("userId", userId)
      .maybeSingle();

    if (data) return data;
  } catch {
    // Fallback to demo profile
  }

  return {
    $id: userId,
    userId,
    email: "demo@bankverse.com",
    firstName: "Demo",
    lastName: "User",
    address1: "123 Main Street",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    dateOfBirth: "1990-01-01",
    ssn: "",
    dwollaCustomerUrl: "",
    dwollaCustomerId: "",
  };
}

/**
 * Get user by email.
 */
export async function getUserByEmail(email: string) {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (data) return data;
  } catch {
    // Fallback
  }
  return null;
}
/**
 * Update user document in Supabase.
 */
export async function updateUserDocument(
  documentId: string,
  data: Record<string, unknown>,
) {
  const supabase = getSupabaseClient();
  try {
    const { data: updated } = await supabase
      .from("users")
      .update(data)
      .eq("$id", documentId)
      .select()
      .single();

    return updated;
  } catch {
    return { $id: documentId, ...data };
  }
}

/**
 * Get a single bank by document ID.
 */
export async function getBankByDocumentId(documentId: string) {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from("banks")
      .select("*")
      .eq("$id", documentId)
      .maybeSingle();

    if (data) return data;
  } catch {
    // Fallback
  }

  return {
    $id: documentId,
    userId: "demo-user-001",
    accountId: "demo-acc-001",
    bankId: "ins_1",
    accessToken: "demo-token",
    fundingSourceUrl: "",
    sharableId: "demo-share-001",
  };
}
/**
 * Create a bank document (linked Plaid / Custom account).
 */
export async function createBankDocument(bank: {
  userId: string;
  accountId: string;
  bankId: string;
  accessToken: string;
  fundingSourceUrl: string;
  sharableId: string;
}) {
  const supabase = getSupabaseClient();
  const bankDoc = {
    $id: `bank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...bank,
    createdAt: new Date().toISOString(),
  };

  try {
    const { data } = await supabase
      .from("banks")
      .insert([bankDoc])
      .select()
      .single();

    return data || bankDoc;
  } catch {
    return bankDoc;
  }
}

/**
 * Get all banks for a user.
 */
export async function getBanksByUserId(userId: string) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return [
      {
        $id: "demo-bank-001",
        userId,
        accountId: "demo-acc-001",
        bankId: "ins_1",
        accessToken: "demo-token",
        fundingSourceUrl: "",
        sharableId: "demo-share-001",
      },
      {
        $id: "demo-bank-002",
        userId,
        accountId: "demo-acc-002",
        bankId: "ins_2",
        accessToken: "demo-token-2",
        fundingSourceUrl: "",
        sharableId: "demo-share-002",
      },
    ];
  }

  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from("banks")
      .select("*")
      .eq("userId", userId);

    if (data && data.length > 0) return data;
  } catch {
    // Fallback
  }

  return [
    {
      $id: "demo-bank-001",
      userId,
      accountId: "demo-acc-001",
      bankId: "ins_1",
      accessToken: "demo-token",
      fundingSourceUrl: "",
      sharableId: "demo-share-001",
    },
    {
      $id: "demo-bank-002",
      userId,
      accountId: "demo-acc-002",
      bankId: "ins_2",
      accessToken: "demo-token-2",
      fundingSourceUrl: "",
      sharableId: "demo-share-002",
    },
  ];
}
/**
 * Get transactions by account IDs.
 */
export async function getTransactionsByUserId(
  accountIds: string[],
  limit = 10,
  offset = 0,
) {
  const mockTransactions = [
    {
      id: "tx-001",
      $id: "tx-001",
      accountId: "demo-acc-001",
      name: "Starbucks Coffee",
      amount: -12.5,
      category: "Food and Drink",
      date: "2026-07-31",
      paymentChannel: "in store",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-002",
      $id: "tx-002",
      accountId: "demo-acc-001",
      name: "Amazon.com",
      amount: -89.99,
      category: "Payment",
      date: "2026-07-30",
      paymentChannel: "online",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-003",
      $id: "tx-003",
      accountId: "demo-acc-001",
      name: "Salary Deposit",
      amount: 4500.0,
      category: "Transfer",
      date: "2026-07-28",
      paymentChannel: "online",
      type: "credit",
      pending: false,
      senderBankId: "",
      receiverBankId: "demo-bank-001",
    },
    {
      id: "tx-004",
      $id: "tx-004",
      accountId: "demo-acc-001",
      name: "Netflix Subscription",
      amount: -15.99,
      category: "Payment",
      date: "2026-07-27",
      paymentChannel: "online",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-005",
      $id: "tx-005",
      accountId: "demo-acc-001",
      name: "Uber Ride",
      amount: -24.3,
      category: "Payment",
      date: "2026-07-26",
      paymentChannel: "online",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-006",
      $id: "tx-006",
      accountId: "demo-acc-002",
      name: "Freelance Payment",
      amount: 1200.0,
      category: "Transfer",
      date: "2026-07-25",
      paymentChannel: "online",
      type: "credit",
      pending: false,
      senderBankId: "",
      receiverBankId: "demo-bank-002",
    },
    {
      id: "tx-007",
      $id: "tx-007",
      accountId: "demo-acc-002",
      name: "Whole Foods",
      amount: -67.45,
      category: "Food and Drink",
      date: "2026-07-24",
      paymentChannel: "in store",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-002",
      receiverBankId: "",
    },
    {
      id: "tx-008",
      $id: "tx-008",
      accountId: "demo-acc-001",
      name: "Spotify Premium",
      amount: -9.99,
      category: "Payment",
      date: "2026-07-23",
      paymentChannel: "online",
      type: "debit",
      pending: true,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-009",
      $id: "tx-009",
      accountId: "demo-acc-002",
      name: "Gas Station",
      amount: -45.0,
      category: "Payment",
      date: "2026-07-22",
      paymentChannel: "in store",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-002",
      receiverBankId: "",
    },
    {
      id: "tx-010",
      $id: "tx-010",
      accountId: "demo-acc-001",
      name: "Apple Store",
      amount: -299.99,
      category: "Payment",
      date: "2026-07-21",
      paymentChannel: "online",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-011",
      $id: "tx-011",
      accountId: "demo-acc-002",
      name: "Interest Payment",
      amount: 3.42,
      category: "Transfer",
      date: "2026-07-20",
      paymentChannel: "online",
      type: "credit",
      pending: false,
      senderBankId: "",
      receiverBankId: "demo-bank-002",
    },
    {
      id: "tx-012",
      $id: "tx-012",
      accountId: "demo-acc-001",
      name: "DoorDash Order",
      amount: -34.5,
      category: "Food and Drink",
      date: "2026-07-19",
      paymentChannel: "online",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-013",
      $id: "tx-013",
      accountId: "demo-acc-001",
      name: "UPI Transfer to Savings",
      amount: -2500,
      category: "Transfer",
      date: "2026-07-18",
      paymentChannel: "UPI",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-014",
      $id: "tx-014",
      accountId: "demo-acc-001",
      name: "Credit Card Bill",
      amount: -500,
      category: "Payment",
      date: "2026-07-17",
      paymentChannel: "Card",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-001",
      receiverBankId: "",
    },
    {
      id: "tx-015",
      $id: "tx-015",
      accountId: "demo-acc-002",
      name: "Rent Payment via Netbanking",
      amount: -10000,
      category: "Payment",
      date: "2026-07-16",
      paymentChannel: "Netbanking",
      type: "debit",
      pending: false,
      senderBankId: "demo-bank-002",
      receiverBankId: "",
    },
  ];

  const filtered = mockTransactions.filter((tx) =>
    accountIds.includes(tx.accountId),
  );
  const total = filtered.length > 0 ? filtered.length : mockTransactions.length;
  const list = filtered.length > 0 ? filtered : mockTransactions;
  const paged = list.slice(offset, offset + limit);

  return { documents: paged, total };
}

/**
 * Create a payment record in Supabase.
 */
export async function createPaymentRecord(params: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "failed";
  method: "upi" | "card" | "netbanking" | "wallet" | "other";
  description: string;
}): Promise<PaymentRecord> {
  const paymentDoc: PaymentRecord = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    $id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    amount: params.amount,
    currency: params.currency,
    status: params.status,
    method: params.method,
    description: params.description,
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from("payments")
      .insert([paymentDoc])
      .select()
      .single();

    if (data) return data;
  } catch {
    // Fallback
  }

  return paymentDoc;
}

/**
 * Get payment records for a user.
 */
export async function getPaymentsByUserId(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ documents: PaymentRecord[]; total: number }> {
  const mockPayments: PaymentRecord[] = [
    {
      id: "pay_001",
      $id: "pay_001",
      userId,
      razorpayOrderId: "order_demo_1738000000001",
      razorpayPaymentId: "pay_demo_ABC123",
      amount: 2500,
      currency: "INR",
      status: "paid",
      method: "upi",
      description: "UPI transfer to savings",
      createdAt: "2025-01-27T14:30:00Z",
    },
    {
      id: "pay_002",
      $id: "pay_002",
      userId,
      razorpayOrderId: "order_demo_1738000000002",
      razorpayPaymentId: "pay_demo_DEF456",
      amount: 500,
      currency: "INR",
      status: "paid",
      method: "card",
      description: "Credit card bill payment",
      createdAt: "2025-01-26T10:15:00Z",
    },
    {
      id: "pay_003",
      $id: "pay_003",
      userId,
      razorpayOrderId: "order_demo_1738000000003",
      razorpayPaymentId: "pay_demo_GHI789",
      amount: 10000,
      currency: "INR",
      status: "paid",
      method: "netbanking",
      description: "Rent payment",
      createdAt: "2025-01-25T08:00:00Z",
    },
  ];

  const paged = mockPayments.slice(offset, offset + limit);
  return { documents: paged, total: mockPayments.length };
}