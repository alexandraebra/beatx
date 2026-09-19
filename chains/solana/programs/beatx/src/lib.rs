use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("BWgVLeu6iqGrgz76Mu9VNRRmJpEMBTne8e2e7AAtobKL");

const MAX_OPTIONS: usize = 8;
const BPS: u64 = 10_000;
const OPEN: u8 = 0;
const LOCKED: u8 = 1;
const CLOSED: u8 = 2;
const SUBMITTED: u8 = 3;
const RESOLVED: u8 = 4;
const CANCELLED: u8 = 5;

#[program]
pub mod beatx {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, protocol_fee_bps: u16, creator_fee_bps: u16) -> Result<()> {
        require!((protocol_fee_bps as u64) + creator_fee_bps as u64 <= BPS, BeatXError::InvalidFees);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.protocol_fee_bps = protocol_fee_bps;
        config.creator_fee_bps = creator_fee_bps;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn create_creator(ctx: Context<CreateCreator>) -> Result<()> {
        let creator = &mut ctx.accounts.creator;
        creator.authority = ctx.accounts.authority.key();
        creator.bump = ctx.bumps.creator;
        Ok(())
    }

    pub fn create_market(ctx: Context<CreateMarket>, market_id: [u8; 32], policy_hash: [u8; 32], option_hashes: Vec<[u8; 32]>, open_time: i64, close_time: i64, resolution_deadline: i64) -> Result<()> {
        require!(option_hashes.len() >= 2 && option_hashes.len() <= MAX_OPTIONS, BeatXError::InvalidOptions);
        require!(open_time >= Clock::get()?.unix_timestamp && open_time < close_time && close_time <= resolution_deadline, BeatXError::InvalidTimes);
        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.authority = ctx.accounts.authority.key();
        market.market_id = market_id;
        market.policy_hash = policy_hash;
        market.option_hashes = option_hashes;
        market.open_time = open_time;
        market.close_time = close_time;
        market.resolution_deadline = resolution_deadline;
        market.status = OPEN;
        market.winning_option = u8::MAX;
        market.vault = ctx.accounts.vault.key();
        market.option_totals = vec![0; market.option_hashes.len()];
        market.protocol_fee_bps = ctx.accounts.config.protocol_fee_bps;
        market.creator_fee_bps = ctx.accounts.config.creator_fee_bps;
        market.protocol_fees_base = 0;
        market.creator_fees_base = 0;
        market.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn lock_market(ctx: Context<MarketAuthority>) -> Result<()> {
        require!(ctx.accounts.market.status == OPEN, BeatXError::InvalidStatus);
        ctx.accounts.market.status = LOCKED;
        Ok(())
    }

    pub fn place_position(ctx: Context<PlacePosition>, position_id: u64, option_index: u8, amount_base_units: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let now = Clock::get()?.unix_timestamp;
        require!(market.status == OPEN || market.status == LOCKED, BeatXError::MarketNotOpen);
        require!(now >= market.open_time && now < market.close_time, BeatXError::MarketClosed);
        require!((option_index as usize) < market.option_totals.len() && amount_base_units > 0, BeatXError::InvalidPosition);
        market.total_volume = market.total_volume.checked_add(amount_base_units).ok_or(BeatXError::ArithmeticOverflow)?;
        market.option_totals[option_index as usize] = market.option_totals[option_index as usize].checked_add(amount_base_units).ok_or(BeatXError::ArithmeticOverflow)?;
        let protocol_fee = amount_base_units.checked_mul(market.protocol_fee_bps as u64).ok_or(BeatXError::ArithmeticOverflow)? / BPS;
        let creator_fee = amount_base_units.checked_mul(market.creator_fee_bps as u64).ok_or(BeatXError::ArithmeticOverflow)? / BPS;
        market.protocol_fees_base = market.protocol_fees_base.checked_add(protocol_fee).ok_or(BeatXError::ArithmeticOverflow)?;
        market.creator_fees_base = market.creator_fees_base.checked_add(creator_fee).ok_or(BeatXError::ArithmeticOverflow)?;
        market.status = LOCKED;
        let position = &mut ctx.accounts.position;
        position.market = market.key();
        position.owner = ctx.accounts.owner.key();
        position.position_id = position_id;
        position.option_index = option_index;
        position.amount_base_units = amount_base_units;
        position.claimed = false;
        position.bump = ctx.bumps.position;
        token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.owner_token_account.to_account_info(), to: ctx.accounts.vault.to_account_info(), authority: ctx.accounts.owner.to_account_info() }), amount_base_units)?;
        Ok(())
    }

    pub fn close_market(ctx: Context<MarketAuthority>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == OPEN || market.status == LOCKED, BeatXError::InvalidStatus);
        require!(Clock::get()?.unix_timestamp >= market.close_time, BeatXError::CloseTimeNotReached);
        market.status = CLOSED;
        Ok(())
    }

    pub fn submit_resolution(ctx: Context<ResolutionAuthority>, winning_option: u8, evidence_hash: [u8; 32]) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == CLOSED, BeatXError::InvalidStatus);
        require!((winning_option as usize) < market.option_totals.len(), BeatXError::InvalidOption);
        require!(Clock::get()?.unix_timestamp <= market.resolution_deadline, BeatXError::ResolutionDeadlinePassed);
        market.winning_option = winning_option;
        market.evidence_hash = evidence_hash;
        market.status = SUBMITTED;
        Ok(())
    }

    pub fn finalize_resolution(ctx: Context<ResolutionAuthority>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == SUBMITTED && market.evidence_hash != [0; 32], BeatXError::InvalidResolution);
        market.status = RESOLVED;
        Ok(())
    }

    pub fn cancel_unopened_market(ctx: Context<MarketAuthority>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == OPEN && market.total_volume == 0, BeatXError::InvalidStatus);
        require!(Clock::get()?.unix_timestamp < market.open_time, BeatXError::MarketAlreadyOpen);
        market.status = CANCELLED;
        Ok(())
    }

    pub fn claim(ctx: Context<ClaimPosition>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        require!(market.status == RESOLVED, BeatXError::ResolutionNotFinal);
        require!(!position.claimed, BeatXError::DoubleClaim);
        position.claimed = true;
        if position.option_index != market.winning_option { return Ok(()); }
        let winning_pool = market.option_totals[market.winning_option as usize];
        require!(winning_pool > 0, BeatXError::InvalidResolution);
        let distributable = market.total_volume.checked_sub(market.protocol_fees_base).ok_or(BeatXError::ArithmeticOverflow)?.checked_sub(market.creator_fees_base).ok_or(BeatXError::ArithmeticOverflow)?;
        let payout = (position.amount_base_units as u128).checked_mul(distributable as u128).ok_or(BeatXError::ArithmeticOverflow)? / winning_pool as u128;
        require!(payout <= ctx.accounts.vault.amount as u128, BeatXError::InsufficientVault);
        let seeds: &[&[u8]] = &[b"market", market.authority.as_ref(), market.market_id.as_ref(), &[market.bump]];
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.owner_token_account.to_account_info(), authority: market.to_account_info() }, &[seeds]), payout as u64)?;
        Ok(())
    }

    pub fn refund_cancelled_position(ctx: Context<ClaimPosition>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        require!(market.status == CANCELLED, BeatXError::MarketNotCancelled);
        require!(!position.claimed, BeatXError::DoubleClaim);
        position.claimed = true;
        let seeds: &[&[u8]] = &[b"market", market.authority.as_ref(), market.market_id.as_ref(), &[market.bump]];
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.owner_token_account.to_account_info(), authority: market.to_account_info() }, &[seeds]), position.amount_base_units)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = authority, space = 8 + ProtocolConfig::SIZE, seeds = [b"protocol"], bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateCreator<'info> {
    #[account(init, payer = authority, space = 8 + Creator::SIZE, seeds = [b"creator", authority.key().as_ref()], bump)]
    pub creator: Account<'info, Creator>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(seeds = [b"protocol"], bump = config.bump)] pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"creator", authority.key().as_ref()], bump = creator.bump)] pub creator: Account<'info, Creator>,
    #[account(init, payer = authority, space = 8 + Market::SIZE, seeds = [b"market", authority.key().as_ref(), market_id.as_ref()], bump)] pub market: Account<'info, Market>,
    #[account(init, payer = authority, token::mint = settlement_mint, token::authority = market, seeds = [b"vault", market.key().as_ref()], bump)] pub vault: Account<'info, TokenAccount>,
    pub settlement_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)] pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>, pub system_program: Program<'info, System>, pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MarketAuthority<'info> {
    #[account(mut, has_one = authority @ BeatXError::Unauthorized)] pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct PlacePosition<'info> {
    #[account(mut)] pub market: Account<'info, Market>,
    #[account(init, payer = owner, space = 8 + Position::SIZE, seeds = [b"position", market.key().as_ref(), owner.key().as_ref(), position_id.to_le_bytes().as_ref()], bump)] pub position: Account<'info, Position>,
    #[account(mut, address = market.vault)] pub vault: Account<'info, TokenAccount>,
    #[account(mut)] pub owner: Signer<'info>,
    #[account(mut, constraint = owner_token_account.owner == owner.key(), constraint = owner_token_account.mint == vault.mint)] pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>, pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolutionAuthority<'info> {
    #[account(mut)] pub market: Account<'info, Market>,
    #[account(seeds = [b"protocol"], bump = config.bump, has_one = authority @ BeatXError::Unauthorized)] pub config: Account<'info, ProtocolConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPosition<'info> {
    #[account(mut)] pub market: Account<'info, Market>,
    #[account(mut, has_one = market, has_one = owner)] pub position: Account<'info, Position>,
    #[account(mut, address = market.vault)] pub vault: Account<'info, TokenAccount>,
    #[account(mut)] pub owner: Signer<'info>,
    #[account(mut, constraint = owner_token_account.owner == owner.key(), constraint = owner_token_account.mint == vault.mint)] pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct ProtocolConfig { pub authority: Pubkey, pub protocol_fee_bps: u16, pub creator_fee_bps: u16, pub bump: u8 }
impl ProtocolConfig { const SIZE: usize = 32 + 2 + 2 + 1; }

#[account]
pub struct Creator { pub authority: Pubkey, pub markets_created: u64, pub markets_settled: u64, pub revenue_base_units: u64, pub bump: u8 }
impl Creator { const SIZE: usize = 32 + 8 + 8 + 8 + 1; }

#[account]
pub struct Market {
    pub creator: Pubkey, pub authority: Pubkey, pub market_id: [u8; 32], pub policy_hash: [u8; 32], pub option_hashes: Vec<[u8; 32]>,
    pub open_time: i64, pub close_time: i64, pub resolution_deadline: i64, pub status: u8, pub winning_option: u8, pub vault: Pubkey,
    pub total_volume: u64, pub option_totals: Vec<u64>, pub protocol_fee_bps: u16, pub creator_fee_bps: u16, pub protocol_fees_base: u64, pub creator_fees_base: u64, pub evidence_hash: [u8; 32], pub bump: u8,
}
impl Market { const SIZE: usize = 32 + 32 + 32 + 32 + 4 + MAX_OPTIONS * 32 + 8 + 8 + 8 + 1 + 1 + 32 + 8 + 4 + MAX_OPTIONS * 8 + 2 + 2 + 8 + 8 + 32 + 1; }

#[account]
pub struct Position { pub market: Pubkey, pub owner: Pubkey, pub position_id: u64, pub option_index: u8, pub amount_base_units: u64, pub claimed: bool, pub bump: u8 }
impl Position { const SIZE: usize = 32 + 32 + 8 + 1 + 8 + 1 + 1; }

#[error_code]
pub enum BeatXError {
    #[msg("Unauthorized signer")] Unauthorized,
    #[msg("Invalid fee configuration")] InvalidFees,
    #[msg("Invalid option count")] InvalidOptions,
    #[msg("Invalid market times")] InvalidTimes,
    #[msg("Invalid market status")] InvalidStatus,
    #[msg("Market is not open")] MarketNotOpen,
    #[msg("Market is closed")] MarketClosed,
    #[msg("Close time has not been reached")] CloseTimeNotReached,
    #[msg("Invalid option or amount")] InvalidPosition,
    #[msg("Invalid option")] InvalidOption,
    #[msg("Resolution deadline passed")] ResolutionDeadlinePassed,
    #[msg("Invalid resolution evidence")] InvalidResolution,
    #[msg("Resolution is not final")] ResolutionNotFinal,
    #[msg("Position was already claimed")] DoubleClaim,
    #[msg("Vault cannot cover payout")] InsufficientVault,
    #[msg("Arithmetic overflow")] ArithmeticOverflow,
    #[msg("Market is already open")] MarketAlreadyOpen,
    #[msg("Market is not cancelled")] MarketNotCancelled,
}
