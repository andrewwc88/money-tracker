/* ===== Seed (entries written from chat) =====
   Loaded before app.js. applySeed() adds any tx whose id is not already in the
   ledger, so reopening never duplicates, and a row deleted by hand stays deleted
   through DB.seedKilled. Every id must be stable and start with s-.

   This file ships to a public URL, so it holds no real numbers. Andrew's ledger
   moves between devices through Backup JSON and Restore in the Ledger tab. */
window.MONEY_SEED = {
  tx: [],
  budgets: {},
  tfsa: 0,
};
