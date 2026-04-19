/**
 * Normalize transaction data from Prisma snake_case to API camelCase
 * @param {Object} tx - Transaction object from Prisma
 * @returns {Object} Normalized transaction object
 */
export const normalizeTransaction = (tx) => {
    if (!tx) return null;

    return {
        id: tx.id,
        walletId: tx.wallet_id,
        amount: Number(tx.amount),
        transactionType: tx.transaction_type,
        status: tx.status,
        description: tx.description,
        evidenceUrl: tx.evidence_url,
        createdBy: tx.created_by,
        createdAt: tx.created_at?.toISOString() || null,
        // Include user info if present
        user: tx.users ? {
            fullName: tx.users.fullName,
            employeeCode: tx.users.employeeCode,
            email: tx.users.email
        } : undefined
    };
};

/**
 * Normalize array of transactions
 * @param {Array} transactions - Array of transaction objects
 * @returns {Array} Normalized transactions
 */
export const normalizeTransactions = (transactions) => {
    if (!Array.isArray(transactions)) return [];
    return transactions.map(normalizeTransaction);
};

/**
 * Normalize wallet data with transactions
 * @param {Object} wallet - Wallet object from Prisma
 * @returns {Object} Normalized wallet object
 */
export const normalizeWallet = (wallet) => {
    if (!wallet) return null;

    return {
        userId: wallet.user_id,
        balance: Number(wallet.balance),
        lastUpdated: wallet.last_updated?.toISOString() || null,
        transactions: wallet.transactions ? normalizeTransactions(wallet.transactions) : undefined,
        user: wallet.users ? {
            fullName: wallet.users.fullName,
            employeeCode: wallet.users.employeeCode,
            email: wallet.users.email
        } : undefined
    };
};
