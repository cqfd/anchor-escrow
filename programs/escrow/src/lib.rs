use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod escrow {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        escrowed_x_tokens_bump: u8,
        x_amount: u64,
        y_amount: u64,
    ) -> ProgramResult {
        let escrow = &mut ctx.accounts.escrow;
        escrow.us = ctx.accounts.us.key().clone();
        escrow.escrowed_x_tokens = ctx.accounts.escrowed_x_tokens.key.clone();
        escrow.escrowed_x_tokens_bump = escrowed_x_tokens_bump;
        escrow.y_amount = y_amount;
        escrow.y_mint = ctx.accounts.y_mint.key();

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.our_x_tokens.to_account_info(),
                    to: ctx.accounts.escrowed_x_tokens.to_account_info(),
                    authority: ctx.accounts.us.to_account_info(),
                },
            ),
            x_amount,
        )?;

        Ok(())
    }

    pub fn execute(ctx: Context<Execute>) -> ProgramResult {
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.escrowed_x_tokens.to_account_info(),
                    to: ctx.accounts.their_x_tokens.to_account_info(),
                    authority: ctx.accounts.escrowed_x_tokens.to_account_info(),
                },
                &[&[
                    ctx.accounts.escrow.key().as_ref(),
                    &[ctx.accounts.escrow.escrowed_x_tokens_bump],
                ]],
            ),
            ctx.accounts.escrowed_x_tokens.amount,
        )?;

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.their_y_tokens.to_account_info(),
                    to: ctx.accounts.our_y_tokens.to_account_info(),
                    authority: ctx.accounts.them.to_account_info(),
                },
            ),
            ctx.accounts.escrow.y_amount,
        )?;

        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> ProgramResult {
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.escrowed_x_tokens.to_account_info(),
                    to: ctx.accounts.our_x_tokens.to_account_info(),
                    authority: ctx.accounts.escrowed_x_tokens.to_account_info(),
                },
                &[&[
                    ctx.accounts.escrow.key().as_ref(),
                    &[ctx.accounts.escrow.escrowed_x_tokens_bump],
                ]],
            ),
            ctx.accounts.escrowed_x_tokens.amount,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrowed_tokens_bump: u8)]
pub struct Initialize<'info> {
    us: Signer<'info>,

    x_mint: Account<'info, Mint>,
    y_mint: Account<'info, Mint>,

    #[account(mut)]
    our_x_tokens: Account<'info, TokenAccount>,

    #[account(init, payer = us)]
    escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = us,
        token::mint = x_mint,
        token::authority = escrowed_x_tokens,
        seeds = [escrow.key().as_ref()],
        bump = escrowed_tokens_bump
    )]
    escrowed_x_tokens: AccountInfo<'info>,

    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    them: Signer<'info>,

    escrow: Account<'info, Escrow>,
    #[account(mut, constraint = escrowed_x_tokens.key() == escrow.escrowed_x_tokens)]
    escrowed_x_tokens: Account<'info, TokenAccount>,

    #[account(mut, constraint = their_y_tokens.mint == escrow.y_mint)]
    their_y_tokens: Account<'info, TokenAccount>,
    #[account(mut, constraint = their_x_tokens.mint == escrowed_x_tokens.mint)]
    their_x_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = our_y_tokens.mint == escrow.y_mint,
        constraint = our_y_tokens.owner == escrow.us
    )]
    our_y_tokens: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    us: Signer<'info>,

    #[account(mut, close = us, constraint = escrow.us == us.key())]
    escrow: Account<'info, Escrow>,

    #[account(mut, constraint = escrowed_x_tokens.key() == escrow.escrowed_x_tokens)]
    escrowed_x_tokens: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = our_x_tokens.mint == escrowed_x_tokens.mint,
        constraint = our_x_tokens.owner == us.key()
    )]
    our_x_tokens: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
}

#[account]
#[derive(Default)]
pub struct Escrow {
    us: Pubkey,
    escrowed_x_tokens: Pubkey,
    escrowed_x_tokens_bump: u8,
    y_mint: Pubkey,
    y_amount: u64,
}
