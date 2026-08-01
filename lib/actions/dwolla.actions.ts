"use server";

import { createDwollaClient } from "@/lib/dwolla/config";
import { getCurrentUser } from "./user.actions";
import { updateUserDocument } from "@/lib/appwrite/db";

/**
 * Create a Dwolla customer for a user.
 */
export const createDwollaCustomer = async () => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const dwollaClient = createDwollaClient();

    const requestBody = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      type: "personal",
      address1: user.address1,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      dateOfBirth: user.dateOfBirth,
      ssn: user.ssn,
    };

    const response = await dwollaClient.post("customers", requestBody);
    const location = response.headers.get("location") || "";

    // Update user document with Dwolla info
    await updateUserDocument(user.$id, {
      dwollaCustomerUrl: location,
      dwollaCustomerId: location.split("/").pop() || "",
    });

    return { success: true, customerUrl: location };
  } catch (error) {
    console.error("createDwollaCustomer error:", error);
    return { success: false, error: "Failed to create Dwolla customer." };
  }
};

/**
 * Create a funding source by linking a Plaid processor token.
 */
export const createFundingSource = async (
  plaidProcessorToken: string,
  bankName: string,
) => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    if (!user.dwollaCustomerUrl) {
      return { success: false, error: "Dwolla customer not created yet." };
    }

    const dwollaClient = createDwollaClient();

    const response = await dwollaClient.post(
      `${user.dwollaCustomerUrl}/funding-sources`,
      {
        plaidToken: plaidProcessorToken,
        name: bankName,
      },
    );

    const location = response.headers.get("location") || "";

    return { success: true, fundingSourceUrl: location };
  } catch (error) {
    console.error("createFundingSource error:", error);
    return { success: false, error: "Failed to create funding source." };
  }
};

/**
 * Initiate an ACH transfer between two funding sources.
 */
export const createTransfer = async (params: {
  sourceFundingSourceUrl: string;
  destinationFundingSourceUrl: string;
  amount: number;
  description?: string;
}) => {
  try {
    const dwollaClient = createDwollaClient();

    const requestBody = {
      _links: {
        source: {
          href: params.sourceFundingSourceUrl,
        },
        destination: {
          href: params.destinationFundingSourceUrl,
        },
      },
      amount: {
        currency: "USD",
        value: params.amount.toFixed(2),
      },
      metadata: {
        description: params.description || "BankVerse Transfer",
      },
    };

    const response = await dwollaClient.post("transfers", requestBody);
    const location = response.headers.get("location") || "";

    return { success: true, transferUrl: location };
  } catch (error) {
    console.error("createTransfer error:", error);
    return { success: false, error: "Failed to create transfer." };
  }
};

/**
 * Get the status of a transfer.
 */
export const getTransferStatus = async (transferUrl: string) => {
  try {
    const dwollaClient = createDwollaClient();

    const response = await dwollaClient.get(transferUrl);

    return { success: true, status: response.body.status };
  } catch (error) {
    console.error("getTransferStatus error:", error);
    return { success: false, error: "Failed to get transfer status." };
  }
};
