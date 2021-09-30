const anchor = require('@project-serum/anchor');
const spl = require('@solana/spl-token');
const { BN } = require('bn.js');
const { assert } = require('chai');

describe('escrow', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow;

  const us = provider.wallet.payer; // anchor.web3.Keypair.generate();
  const them = anchor.web3.Keypair.generate();

  let X, Y;
  const startXBalance = 1000;
  const startYBalance = 1000;
  const escrowAmountX = 100;
  const escrowAmountY = 200;

  before(async () => {
    await provider.connection.requestAirdrop(them.publicKey, 1000);
    X = await spl.Token.createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6,
      spl.TOKEN_PROGRAM_ID
    );
    Y = await spl.Token.createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6,
      spl.TOKEN_PROGRAM_ID
    );
  });

  it('It works!', async () => {
    const escrow = anchor.web3.Keypair.generate();

    const [escrowedXTokens, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [escrow.publicKey.toBuffer()],
      program.programId
    );

    const ourXTokens = await X.createAccount(us.publicKey);
    await X.mintTo(ourXTokens, provider.wallet.payer, [], startXBalance);
    const ourYTokens = await Y.createAccount(us.publicKey);

    // Add your test here.
    await program.rpc.initialize(
      new anchor.BN(bump),
      new anchor.BN(100),
      new anchor.BN(200),
      {
        accounts: {
          us: provider.wallet.publicKey,
          xMint: X.publicKey,
          yMint: Y.publicKey,
          ourXTokens: ourXTokens,
          escrow: escrow.publicKey,
          escrowedXTokens: escrowedXTokens,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId
        },
        signers: [escrow]
      }
    );

    let escrowedXTokensAccount = await X.getAccountInfo(escrowedXTokens);
    assert.equal(escrowedXTokensAccount.amount.toNumber(), escrowAmountX);
    assert.equal(escrowedXTokensAccount.mint.toBase58(), X.publicKey.toBase58());

    let escrowAccount = await program.account.escrow.fetch(escrow.publicKey);
    assert.equal(escrowAccount.yAmount.toNumber(), escrowAmountY);

    const theirYTokens = await Y.createAccount(them.publicKey);
    await Y.mintTo(theirYTokens, provider.wallet.payer, [], startYBalance);
    const theirXTokens = await X.createAccount(them.publicKey);

    await program.rpc.execute(
      {
        accounts: {
          escrow: escrow.publicKey,
          escrowedXTokens: escrowedXTokens,
          ourYTokens: ourYTokens,
          them: them.publicKey,
          theirXTokens: theirXTokens,
          theirYTokens: theirYTokens,
          tokenProgram: spl.TOKEN_PROGRAM_ID
        },
        signers: [them]
      }
    );

    escrowedXTokensAccount = await X.getAccountInfo(escrowedXTokens);
    assert.equal(escrowedXTokensAccount.amount.toNumber(), 0);

    theirXTokensAccount = await X.getAccountInfo(theirXTokens);
    assert.equal(theirXTokensAccount.amount.toNumber(), escrowAmountX);

    const ourYTokensAccount = await Y.getAccountInfo(ourYTokens);
    assert.equal(ourYTokensAccount.amount.toNumber(), escrowAmountY);
  });

  it('Supports cancellation!', async () => {
    const escrow = anchor.web3.Keypair.generate();

    const [escrowedXTokens, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [escrow.publicKey.toBuffer()],
      program.programId
    );

    const ourXTokens = await X.createAccount(us.publicKey);
    await X.mintTo(ourXTokens, provider.wallet.payer, [], startXBalance);

    // Add your test here.
    await program.rpc.initialize(
      new anchor.BN(bump),
      new anchor.BN(100),
      new anchor.BN(200),
      {
        accounts: {
          us: provider.wallet.publicKey,
          xMint: X.publicKey,
          yMint: Y.publicKey,
          ourXTokens: ourXTokens,
          escrow: escrow.publicKey,
          escrowedXTokens: escrowedXTokens,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId
        },
        signers: [escrow]
      }
    );

    let ourXTokensAccount = await X.getAccountInfo(ourXTokens);
    assert.equal(ourXTokensAccount.amount.toNumber(), startXBalance - escrowAmountX);

    await program.rpc.cancel(
      {
        accounts: {
          us: provider.wallet.publicKey,
          escrow: escrow.publicKey,
          escrowedXTokens: escrowedXTokens,
          ourXTokens: ourXTokens,
          tokenProgram: spl.TOKEN_PROGRAM_ID
        },
        // signers: [us]
      }
    );

    ourXTokensAccount = await X.getAccountInfo(ourXTokens);
    assert.equal(ourXTokensAccount.amount.toNumber(), startXBalance);

    // Try executing the escrow anyway, despite already cancelling it.
    const ourYTokens = await Y.createAccount(us.publicKey);
    const theirYTokens = await Y.createAccount(them.publicKey);
    await Y.mintTo(theirYTokens, provider.wallet.payer, [], startYBalance);
    const theirXTokens = await X.createAccount(them.publicKey);

    try {
      await program.rpc.execute(
        {
          accounts: {
            them: them.publicKey,
            escrow: escrow.publicKey,
            escrowedXTokens: escrowedXTokens,
            theirYTokens: theirYTokens,
            theirXTokens: theirXTokens,
            ourYTokens: ourYTokens,
            tokenProgram: spl.TOKEN_PROGRAM_ID
          },
          signers: [them]
        }
      );
      assert.fail();
    } catch (err) {
      assert.equal(err.code, 0xa7)
    }
  });
});
