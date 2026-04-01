#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

const MAX_TITLE:     u32 = 80;
const MAX_DESC:      u32 = 300;
const MAX_CAMPAIGNS: u32 = 50;

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum CampaignStatus {
    Active,     // accepting donations, match available
    Exhausted,  // match pool used up
    Closed,     // campaign ended, matcher withdrew remainder
}

#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub id:              u64,
    pub matcher:         Address,   // who deposited the match pool
    pub beneficiary:     Address,   // receives donations + match
    pub title:           String,
    pub description:     String,
    pub match_pool:      i128,      // total XLM matcher deposited
    pub match_remaining: i128,      // how much match is left
    pub donated_total:   i128,      // total donated by public
    pub matched_total:   i128,      // total matched and paid out
    pub donor_count:     u32,
    pub status:          CampaignStatus,
    pub created_at:      u32,
}

#[contracttype]
pub enum DataKey {
    Campaign(u64),
    Count,
    RecentIds,  // Vec<u64> last 20
}

#[contract]
pub struct DonationMatchContract;

#[contractimpl]
impl DonationMatchContract {
    /// Matcher creates a campaign and deposits the match pool
    pub fn create_campaign(
        env: Env,
        matcher: Address,
        beneficiary: Address,
        title: String,
        description: String,
        match_pool: i128,
        xlm_token: Address,
    ) -> u64 {
        matcher.require_auth();
        assert!(title.len() > 0 && title.len() <= MAX_TITLE, "Title 1–80 chars");
        assert!(description.len() <= MAX_DESC, "Desc max 300 chars");
        assert!(match_pool >= 10_000_000, "Min match pool 1 XLM");
        assert!(matcher != beneficiary, "Matcher cannot be beneficiary");

        let count: u64 = env.storage().instance()
            .get(&DataKey::Count).unwrap_or(0u64);
        assert!(count < MAX_CAMPAIGNS as u64, "Campaign limit reached");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&matcher, &env.current_contract_address(), &match_pool);

        let id = count + 1;
        let campaign = Campaign {
            id,
            matcher: matcher.clone(),
            beneficiary,
            title,
            description,
            match_pool,
            match_remaining: match_pool,
            donated_total: 0,
            matched_total: 0,
            donor_count: 0,
            status: CampaignStatus::Active,
            created_at: env.ledger().sequence(),
        };

        env.storage().persistent().set(&DataKey::Campaign(id), &campaign);
        env.storage().instance().set(&DataKey::Count, &id);

        let mut recent: Vec<u64> = env.storage().instance()
            .get(&DataKey::RecentIds).unwrap_or(Vec::new(&env));
        recent.push_back(id);
        while recent.len() > 20 { recent.remove(0); }
        env.storage().instance().set(&DataKey::RecentIds, &recent);

        env.events().publish((symbol_short!("created"),), (id, matcher, match_pool));
        id
    }

    /// Anyone donates XLM — contract immediately matches up to remaining pool
    /// and sends donation + match directly to beneficiary
    pub fn donate(
        env: Env,
        donor: Address,
        campaign_id: u64,
        amount: i128,
        xlm_token: Address,
    ) {
        donor.require_auth();
        assert!(amount >= 1_000_000, "Min donation 0.1 XLM");

        let mut campaign: Campaign = env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id)).expect("Not found");

        assert!(campaign.status == CampaignStatus::Active, "Campaign not active");
        assert!(campaign.matcher != donor, "Matcher cannot donate to own campaign");

        let token_client = token::Client::new(&env, &xlm_token);

        // Transfer donation from donor to contract
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        // Match amount = min(donation, remaining pool)
        let matched = amount.min(campaign.match_remaining);

        // Send donation + match to beneficiary in one payment
        let payout = amount + matched;
        token_client.transfer(
            &env.current_contract_address(),
            &campaign.beneficiary,
            &payout,
        );

        campaign.donated_total   += amount;
        campaign.matched_total   += matched;
        campaign.match_remaining -= matched;
        campaign.donor_count     += 1;

        if campaign.match_remaining == 0 {
            campaign.status = CampaignStatus::Exhausted;
        }

        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);
        env.events().publish(
            (symbol_short!("donated"),),
            (campaign_id, donor, amount, matched, payout),
        );
    }

    /// Matcher closes campaign and reclaims unmatched pool
    pub fn close_campaign(
        env: Env,
        matcher: Address,
        campaign_id: u64,
        xlm_token: Address,
    ) {
        matcher.require_auth();

        let mut campaign: Campaign = env.storage().persistent()
            .get(&DataKey::Campaign(campaign_id)).expect("Not found");

        assert!(campaign.matcher == matcher, "Not the matcher");
        assert!(
            campaign.status == CampaignStatus::Active
                || campaign.status == CampaignStatus::Exhausted,
            "Already closed"
        );

        if campaign.match_remaining > 0 {
            let token_client = token::Client::new(&env, &xlm_token);
            token_client.transfer(
                &env.current_contract_address(),
                &matcher,
                &campaign.match_remaining,
            );
        }

        campaign.status = CampaignStatus::Closed;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);
        env.events().publish((symbol_short!("closed"),), (campaign_id, campaign.match_remaining));
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_campaign(env: Env, id: u64) -> Campaign {
        env.storage().persistent()
            .get(&DataKey::Campaign(id)).expect("Not found")
    }

    pub fn get_recent(env: Env) -> Vec<u64> {
        env.storage().instance()
            .get(&DataKey::RecentIds).unwrap_or(Vec::new(&env))
    }

    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
