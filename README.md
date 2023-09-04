# SOL Swap with Jupiter CPI

This borrows SOL from the program itself to create a wSOL account then call Jupiter Swap via CPI. Borrower can only
borrow the required amount for creating a wSOL account. This is to solve a problem when a borrower may not have
enough SOL to do anything when swapping through Jupiter.

With this, the borrower can immediately swap any tokens on Jupiter to SOL even if they don't have enough to open
a wSOL account. On top of that, if the user doesn't have any SOL, we can have another payer for the swap as well.

This particular implementation has one problem tho. CPI has size limit so it may not work with all routes. For another
implementation that uses Jupiter Swap without CPI, you can refer to: https://github.com/jup-ag/sol-swap-flash-fill

## How this works?

1. Borrow enough SOL from the program to open a wSOL account that the program owns.
2. Swap X token from the user to wSOL on Jupiter via CPI.
3. Close the wSOL account and send it to the program.
4. The program then transfers the SOL back to the user.

* Example: `./cli/swap-to-sol.ts`
* Transaction: https://solscan.io/tx/GX1rh9y15mn2jqkQ5mosPqkg8YYFWQZqvihR95aRpPQeEMZhhPqWzMUbN1iCqYkubqyB2fLW3UGR4j5w28srrtm