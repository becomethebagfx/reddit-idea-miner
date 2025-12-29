// Demo data for testing pipeline without Reddit API access

import { upsertPost, upsertComments, upsertThread, upsertSubreddit } from '../store/db.js';
import type { Post, Comment, Thread, Subreddit } from '../store/models.js';

export const DEMO_SUBREDDITS: Subreddit[] = [
  {
    id: 'sysadmin',
    display_name: 'sysadmin',
    category: 'IT Operations',
    intent_score: 9,
    typical_pain_points: ['documentation', 'monitoring', 'automation'],
    keywords_to_watch: ['tool', 'recommend', 'alternative'],
  },
  {
    id: 'msp',
    display_name: 'msp',
    category: 'IT Operations',
    intent_score: 10,
    typical_pain_points: ['PSA', 'RMM', 'ticketing'],
    keywords_to_watch: ['software', 'recommend', 'pricing'],
  },
];

// Additional posts from various subreddits for better clustering
const ADDITIONAL_DEMO_POSTS: Post[] = [
  {
    id: 'demo_post_6',
    subreddit: 'sysadmin',
    title: 'We need a better way to track software licenses',
    selftext: `Managing software licenses across 500+ machines is a nightmare. We have no idea if we're compliant or overpaying.

Currently using a spreadsheet but it's always out of date. Need something that auto-discovers installed software and compares against our entitlements.

Anyone have recommendations? Budget up to $2000/month.`,
    author: 'license_tracker',
    score: 156,
    upvote_ratio: 0.89,
    num_comments: 72,
    created_utc: Date.now() / 1000 - 86400 * 6,
    permalink: '/r/sysadmin/comments/demo_post_6/software_licenses/',
    is_self: true,
  },
  {
    id: 'demo_post_7',
    subreddit: 'msp',
    title: 'SLA tracking and reporting - how do you handle it?',
    selftext: `Our clients are asking for SLA reports but manually tracking response and resolution times is killing us.

We need automated SLA tracking with nice client-facing reports. Our PSA has basic reporting but it's ugly and missing context.

Any tools that integrate with PSAs and generate professional SLA reports?`,
    author: 'sla_struggler',
    score: 134,
    upvote_ratio: 0.91,
    num_comments: 56,
    created_utc: Date.now() / 1000 - 86400 * 8,
    permalink: '/r/msp/comments/demo_post_7/sla_tracking/',
    is_self: true,
  },
  {
    id: 'demo_post_8',
    subreddit: 'sysadmin',
    title: 'Change management is broken - approvals take forever',
    selftext: `Our change management process involves emails, tickets, and manual approvals. A simple firewall rule change takes 3 days to get approved.

Looking for a change management system that:
- Integrates with ServiceNow
- Has proper approval workflows
- Tracks change history
- Shows risk assessment

Enterprise solutions are too expensive. Need something mid-market.`,
    author: 'change_mgmt_guy',
    score: 189,
    upvote_ratio: 0.93,
    num_comments: 84,
    created_utc: Date.now() / 1000 - 86400 * 9,
    permalink: '/r/sysadmin/comments/demo_post_8/change_management/',
    is_self: true,
  },
  {
    id: 'demo_post_9',
    subreddit: 'msp',
    title: 'Vendor management is chaos - anyone have a solution?',
    selftext: `We work with 30+ vendors and keeping track of contracts, renewals, and contacts is insane.

Last month we missed a renewal and auto-renewed at a higher rate. Cost us $5k.

Need a vendor management tool that tracks:
- Contract dates and auto-renewals
- Pricing/discounts
- Contact info
- Support escalation paths

Would pay $500/month for something that prevents these costly mistakes.`,
    author: 'vendor_chaos',
    score: 178,
    upvote_ratio: 0.90,
    num_comments: 67,
    created_utc: Date.now() / 1000 - 86400 * 10,
    permalink: '/r/msp/comments/demo_post_9/vendor_management/',
    is_self: true,
  },
  {
    id: 'demo_post_10',
    subreddit: 'sysadmin',
    title: 'Network diagram tools that actually stay updated?',
    selftext: `Every network diagram we create is outdated within a month. Manual updates are impossible with our rate of change.

Looking for tools that auto-discover and update network topology. Tried several but they all require too much manual intervention.

We have 500 devices across 3 datacenters. Need something that scales.`,
    author: 'net_diagram_guy',
    score: 145,
    upvote_ratio: 0.88,
    num_comments: 62,
    created_utc: Date.now() / 1000 - 86400 * 11,
    permalink: '/r/sysadmin/comments/demo_post_10/network_diagrams/',
    is_self: true,
  },
  {
    id: 'demo_post_11',
    subreddit: 'msp',
    title: 'QBR preparation takes way too long',
    selftext: `Preparing Quarterly Business Reviews for clients is eating up 2-3 days per client. We have 40 clients.

Need to automate pulling metrics, creating presentations, and generating recommendations.

Anyone using tools for QBR automation? Or have templates/processes that speed this up?`,
    author: 'qbr_overload',
    score: 167,
    upvote_ratio: 0.92,
    num_comments: 78,
    created_utc: Date.now() / 1000 - 86400 * 12,
    permalink: '/r/msp/comments/demo_post_11/qbr_automation/',
    is_self: true,
  },
  {
    id: 'demo_post_12',
    subreddit: 'sysadmin',
    title: 'Patch management across hybrid environments',
    selftext: `We have a mix of on-prem Windows, Linux, and cloud VMs. Keeping everything patched is a nightmare.

WSUS only handles Windows. We need a unified solution that:
- Patches Windows, Linux, and macOS
- Works across on-prem and cloud
- Has proper scheduling and rollback
- Reports on compliance

Anyone found a good solution for this?`,
    author: 'patch_madness',
    score: 234,
    upvote_ratio: 0.95,
    num_comments: 112,
    created_utc: Date.now() / 1000 - 86400 * 13,
    permalink: '/r/sysadmin/comments/demo_post_12/patch_management/',
    is_self: true,
  },
  {
    id: 'demo_post_13',
    subreddit: 'msp',
    title: 'Client communication during outages is a mess',
    selftext: `When we have a multi-client outage, communicating status to everyone is chaotic.

We end up sending emails, updating tickets, posting to Slack - all manually while trying to fix the issue.

Need a status page solution for MSPs that:
- Sends automatic updates to affected clients
- Integrates with our monitoring
- Has client-specific views
- Tracks incidents historically`,
    author: 'outage_communicator',
    score: 145,
    upvote_ratio: 0.89,
    num_comments: 56,
    created_utc: Date.now() / 1000 - 86400 * 14,
    permalink: '/r/msp/comments/demo_post_13/outage_communication/',
    is_self: true,
  },
  {
    id: 'demo_post_14',
    subreddit: 'sysadmin',
    title: 'User access reviews are a compliance nightmare',
    selftext: `We have quarterly access reviews for SOX compliance. Takes weeks to gather data from AD, apps, and cloud services.

Then we send spreadsheets to managers who never respond on time.

Looking for tools that automate access certification:
- Pull users from all systems
- Send review requests to managers
- Track completion
- Generate audit reports

Enterprise IAM tools are $100k+. Need something affordable.`,
    author: 'access_reviewer',
    score: 198,
    upvote_ratio: 0.91,
    num_comments: 89,
    created_utc: Date.now() / 1000 - 86400 * 15,
    permalink: '/r/sysadmin/comments/demo_post_14/access_reviews/',
    is_self: true,
  },
  {
    id: 'demo_post_15',
    subreddit: 'msp',
    title: 'Billing reconciliation between PSA and accounting is broken',
    selftext: `Every month we spend days reconciling our PSA billing with QuickBooks. Things never match up.

Time entries get missed, rates are wrong, recurring charges don't sync properly.

Anyone have a tool or process that automates PSA to accounting reconciliation?`,
    author: 'billing_nightmare',
    score: 156,
    upvote_ratio: 0.87,
    num_comments: 67,
    created_utc: Date.now() / 1000 - 86400 * 16,
    permalink: '/r/msp/comments/demo_post_15/billing_reconciliation/',
    is_self: true,
  },
];

// Additional comments for the new posts
const ADDITIONAL_DEMO_COMMENTS: Comment[] = [
  // Comments for demo_post_6 (software licenses)
  {
    id: 'comment_6_1',
    post_id: 'demo_post_6',
    parent_id: 'demo_post_6',
    depth: 0,
    author: 'license_pro',
    body: 'Flexera is the enterprise standard but expensive. For mid-market, check out Snipe-IT for asset/license tracking. Its open source.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 5.9,
    is_submitter: false,
  },
  {
    id: 'comment_6_2',
    post_id: 'demo_post_6',
    parent_id: 'demo_post_6',
    depth: 0,
    author: 'software_auditor',
    body: 'We got hit with a $200k audit from Adobe because we couldnt prove compliance. Would have gladly paid $2k/month to avoid that.',
    score: 78,
    created_utc: Date.now() / 1000 - 86400 * 5.8,
    is_submitter: false,
  },
  // Comments for demo_post_7 (SLA tracking)
  {
    id: 'comment_7_1',
    post_id: 'demo_post_7',
    parent_id: 'demo_post_7',
    depth: 0,
    author: 'sla_master',
    body: 'BrightGauge works great for this. Connects to most PSAs and creates beautiful client-facing dashboards. About $200/month.',
    score: 67,
    created_utc: Date.now() / 1000 - 86400 * 7.9,
    is_submitter: false,
  },
  // Comments for demo_post_8 (change management)
  {
    id: 'comment_8_1',
    post_id: 'demo_post_8',
    parent_id: 'demo_post_8',
    depth: 0,
    author: 'itil_practitioner',
    body: 'Change management is where so many companies struggle. The tools exist but theyre either too complex or too simple. Nothing hits the mid-market sweet spot.',
    score: 56,
    created_utc: Date.now() / 1000 - 86400 * 8.9,
    is_submitter: false,
  },
  // Comments for demo_post_9 (vendor management)
  {
    id: 'comment_9_1',
    post_id: 'demo_post_9',
    parent_id: 'demo_post_9',
    depth: 0,
    author: 'procurement_pro',
    body: 'Vendor management is so overlooked. We started using Zylo for SaaS management and discovered $50k in duplicate subscriptions.',
    score: 89,
    created_utc: Date.now() / 1000 - 86400 * 9.9,
    is_submitter: false,
  },
  // Comments for demo_post_10 (network diagrams)
  {
    id: 'comment_10_1',
    post_id: 'demo_post_10',
    parent_id: 'demo_post_10',
    depth: 0,
    author: 'network_admin',
    body: 'Netbox has improved a lot. Still needs some manual work but the discovery integrations are getting better. Free and open source too.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 10.9,
    is_submitter: false,
  },
  // Comments for demo_post_11 (QBR automation)
  {
    id: 'comment_11_1',
    post_id: 'demo_post_11',
    parent_id: 'demo_post_11',
    depth: 0,
    author: 'qbr_automator',
    body: 'We built Power BI dashboards that pull from our PSA and RMM. Takes about 1 hour per QBR now instead of 2 days. Would pay for a pre-built solution though.',
    score: 78,
    created_utc: Date.now() / 1000 - 86400 * 11.9,
    is_submitter: false,
  },
  // Comments for demo_post_12 (patch management)
  {
    id: 'comment_12_1',
    post_id: 'demo_post_12',
    parent_id: 'demo_post_12',
    depth: 0,
    author: 'patch_expert',
    body: 'Automox handles cross-platform patching well. Cloud-native so works everywhere. About $3/endpoint/month.',
    score: 89,
    created_utc: Date.now() / 1000 - 86400 * 12.9,
    is_submitter: false,
  },
  // Comments for demo_post_13 (outage communication)
  {
    id: 'comment_13_1',
    post_id: 'demo_post_13',
    parent_id: 'demo_post_13',
    depth: 0,
    author: 'status_page_fan',
    body: 'Statuspage.io is great but pricey for MSPs with many clients. We built a simple one using Notion + automation. Not as polished but it works.',
    score: 56,
    created_utc: Date.now() / 1000 - 86400 * 13.9,
    is_submitter: false,
  },
  // Comments for demo_post_14 (access reviews)
  {
    id: 'comment_14_1',
    post_id: 'demo_post_14',
    parent_id: 'demo_post_14',
    depth: 0,
    author: 'iam_specialist',
    body: 'Access reviews are such a pain. We use SailPoint but its enterprise priced. The mid-market really needs a simpler solution. Big opportunity here.',
    score: 67,
    created_utc: Date.now() / 1000 - 86400 * 14.9,
    is_submitter: false,
  },
  // Comments for demo_post_15 (billing reconciliation)
  {
    id: 'comment_15_1',
    post_id: 'demo_post_15',
    parent_id: 'demo_post_15',
    depth: 0,
    author: 'msp_accountant',
    body: 'This is why we switched to ConnectWise + Wise-Sync. Automatic sync to QuickBooks. But theres definitely room for a better solution.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 15.9,
    is_submitter: false,
  },
];

export const DEMO_POSTS: Post[] = [
  {
    id: 'demo_post_1',
    subreddit: 'sysadmin',
    title: 'Looking for a tool to automate documentation - spending hours every week manually updating',
    selftext: `Our team spends about 10 hours per week updating documentation across multiple systems. We have 200+ servers and every time there's a change, someone has to manually update the wiki.

I'm looking for recommendations for software that can automatically discover and document our infrastructure. We've tried Netbox but it requires too much manual input.

Budget is around $500/month. We would pay more if it actually worked well.

What are you all using?`,
    author: 'sysadmin_user1',
    score: 245,
    upvote_ratio: 0.92,
    num_comments: 89,
    created_utc: Date.now() / 1000 - 86400 * 3,
    permalink: '/r/sysadmin/comments/demo_post_1/looking_for_tool/',
    is_self: true,
  },
  {
    id: 'demo_post_2',
    subreddit: 'sysadmin',
    title: 'Password rotation is a nightmare - any alternatives to manual tracking?',
    selftext: `We have a policy to rotate service account passwords every 90 days. Right now this is tracked in a spreadsheet and it's a complete nightmare.

Last month we missed 3 accounts and caused an outage. Our CISO is furious.

Is there software that can handle this automatically? We're a mid-size company with about 500 service accounts across AD, Azure, and various applications.

I would pay $1000/month to never deal with this spreadsheet again.`,
    author: 'it_manager_42',
    score: 178,
    upvote_ratio: 0.95,
    num_comments: 67,
    created_utc: Date.now() / 1000 - 86400 * 5,
    permalink: '/r/sysadmin/comments/demo_post_2/password_rotation/',
    is_self: true,
  },
  {
    id: 'demo_post_3',
    subreddit: 'msp',
    title: 'ConnectWise pricing is insane - what are the alternatives?',
    selftext: `Just got our renewal quote from ConnectWise and it's 40% higher than last year. We're a 15 person MSP and this is becoming unsustainable.

Looking for alternatives that have:
- Ticketing
- Time tracking
- Basic RMM integration
- Client portal

We don't need all the advanced features. Just need something that works and doesn't cost a fortune.

Has anyone switched from ConnectWise to something else? What was your experience?`,
    author: 'msp_owner_99',
    score: 312,
    upvote_ratio: 0.88,
    num_comments: 156,
    created_utc: Date.now() / 1000 - 86400 * 2,
    permalink: '/r/msp/comments/demo_post_3/connectwise_alternatives/',
    is_self: true,
  },
  {
    id: 'demo_post_4',
    subreddit: 'msp',
    title: 'Client onboarding takes us 2 weeks - how do you streamline this?',
    selftext: `Every time we sign a new client, it takes us about 2 weeks to fully onboard them. We have to:

1. Set up their tenant in our tools
2. Deploy agents
3. Configure monitoring
4. Set up documentation
5. Create their portal access
6. Train their team

It's all manual and I'm wasting so much time on repetitive tasks. Looking for any tools or processes that can help automate this.

Would love to hear how other MSPs handle onboarding.`,
    author: 'msp_tech_lead',
    score: 198,
    upvote_ratio: 0.91,
    num_comments: 78,
    created_utc: Date.now() / 1000 - 86400 * 7,
    permalink: '/r/msp/comments/demo_post_4/client_onboarding/',
    is_self: true,
  },
  {
    id: 'demo_post_5',
    subreddit: 'sysadmin',
    title: 'Alert fatigue is killing our team - too many false positives',
    selftext: `We get about 500 alerts per day and 90% of them are false positives or low priority. Our NOC team is completely burnt out.

We've tried tuning thresholds but it's a constant game of whack-a-mole. Every time we fix one thing, something else starts flooding alerts.

Is there an AI-powered tool that can learn what's actually important and reduce the noise? I've heard about AIOps but not sure where to start.

Budget isn't a huge concern if it actually solves the problem.`,
    author: 'noc_manager',
    score: 267,
    upvote_ratio: 0.94,
    num_comments: 134,
    created_utc: Date.now() / 1000 - 86400 * 4,
    permalink: '/r/sysadmin/comments/demo_post_5/alert_fatigue/',
    is_self: true,
  },
];

export const DEMO_COMMENTS: Comment[] = [
  // Comments for demo_post_1 (documentation automation)
  {
    id: 'comment_1_1',
    post_id: 'demo_post_1',
    parent_id: 'demo_post_1',
    depth: 0,
    author: 'infra_architect',
    body: 'We had the same problem. Tried IT Glue but it was expensive and still required a lot of manual work. Ended up building a custom solution with Ansible that auto-generates docs from our infrastructure.',
    score: 89,
    created_utc: Date.now() / 1000 - 86400 * 2.9,
    is_submitter: false,
  },
  {
    id: 'comment_1_2',
    post_id: 'demo_post_1',
    parent_id: 'demo_post_1',
    depth: 0,
    author: 'doc_enthusiast',
    body: 'The struggle is real. We waste at least 15 hours per week on documentation. Would pay good money for something that actually autodiscovers and keeps things updated.',
    score: 67,
    created_utc: Date.now() / 1000 - 86400 * 2.8,
    is_submitter: false,
  },
  {
    id: 'comment_1_3',
    post_id: 'demo_post_1',
    parent_id: 'comment_1_1',
    depth: 1,
    author: 'sysadmin_user1',
    body: 'How long did it take to build? We dont have much dev resources available.',
    score: 23,
    created_utc: Date.now() / 1000 - 86400 * 2.7,
    is_submitter: true,
  },
  {
    id: 'comment_1_4',
    post_id: 'demo_post_1',
    parent_id: 'comment_1_3',
    depth: 2,
    author: 'infra_architect',
    body: 'About 3 months for the basic version. Honestly wish there was a commercial product that just worked out of the box. Would have saved us a lot of time.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 2.6,
    is_submitter: false,
  },
  {
    id: 'comment_1_5',
    post_id: 'demo_post_1',
    parent_id: 'demo_post_1',
    depth: 0,
    author: 'msp_consultant',
    body: 'Hudu is decent for the price. Not fully automatic but the templates save a lot of time. Around $30/user/month.',
    score: 34,
    created_utc: Date.now() / 1000 - 86400 * 2.5,
    is_submitter: false,
  },

  // Comments for demo_post_2 (password rotation)
  {
    id: 'comment_2_1',
    post_id: 'demo_post_2',
    parent_id: 'demo_post_2',
    depth: 0,
    author: 'security_engineer',
    body: 'CyberArk is the enterprise solution but it\'s incredibly expensive. For mid-size, look at Delinea (formerly Thycotic). We use it for about 300 accounts and it works well.',
    score: 78,
    created_utc: Date.now() / 1000 - 86400 * 4.9,
    is_submitter: false,
  },
  {
    id: 'comment_2_2',
    post_id: 'demo_post_2',
    parent_id: 'demo_post_2',
    depth: 0,
    author: 'fellow_sufferer',
    body: 'I feel your pain. We had a similar incident last quarter. The spreadsheet approach just doesnt scale. Someone needs to build a simpler, cheaper alternative to the enterprise tools.',
    score: 56,
    created_utc: Date.now() / 1000 - 86400 * 4.8,
    is_submitter: false,
  },
  {
    id: 'comment_2_3',
    post_id: 'demo_post_2',
    parent_id: 'comment_2_1',
    depth: 1,
    author: 'it_manager_42',
    body: 'What does Delinea run per month? CyberArk quoted us $80k/year which is way out of budget.',
    score: 23,
    created_utc: Date.now() / 1000 - 86400 * 4.7,
    is_submitter: true,
  },
  {
    id: 'comment_2_4',
    post_id: 'demo_post_2',
    parent_id: 'comment_2_3',
    depth: 2,
    author: 'security_engineer',
    body: 'Around $15-20k/year for your size. Still not cheap but much more reasonable than CyberArk.',
    score: 34,
    created_utc: Date.now() / 1000 - 86400 * 4.6,
    is_submitter: false,
  },

  // Comments for demo_post_3 (ConnectWise alternatives)
  {
    id: 'comment_3_1',
    post_id: 'demo_post_3',
    parent_id: 'demo_post_3',
    depth: 0,
    author: 'ex_connectwise_user',
    body: 'Switched to Halo PSA 6 months ago. Half the price and honestly the interface is so much better. Migration was painful but worth it.',
    score: 134,
    created_utc: Date.now() / 1000 - 86400 * 1.9,
    is_submitter: false,
  },
  {
    id: 'comment_3_2',
    post_id: 'demo_post_3',
    parent_id: 'demo_post_3',
    depth: 0,
    author: 'small_msp',
    body: 'ConnectWise pricing is predatory. They know you\'re locked in with all your data and processes. The switching cost is their moat.',
    score: 98,
    created_utc: Date.now() / 1000 - 86400 * 1.8,
    is_submitter: false,
  },
  {
    id: 'comment_3_3',
    post_id: 'demo_post_3',
    parent_id: 'comment_3_1',
    depth: 1,
    author: 'msp_owner_99',
    body: 'How was the migration process? I\'m worried about losing 5 years of ticket history.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 1.7,
    is_submitter: true,
  },
  {
    id: 'comment_3_4',
    post_id: 'demo_post_3',
    parent_id: 'comment_3_3',
    depth: 2,
    author: 'ex_connectwise_user',
    body: 'Took about 2 weeks with their migration team. We kept all history. Main pain was retraining the team on the new interface.',
    score: 67,
    created_utc: Date.now() / 1000 - 86400 * 1.6,
    is_submitter: false,
  },
  {
    id: 'comment_3_5',
    post_id: 'demo_post_3',
    parent_id: 'demo_post_3',
    depth: 0,
    author: 'syncro_fan',
    body: 'Syncro is great for smaller MSPs. $139/user/month for PSA+RMM combined. Simple and just works.',
    score: 56,
    created_utc: Date.now() / 1000 - 86400 * 1.5,
    is_submitter: false,
  },

  // Comments for demo_post_4 (client onboarding)
  {
    id: 'comment_4_1',
    post_id: 'demo_post_4',
    parent_id: 'demo_post_4',
    depth: 0,
    author: 'automation_nerd',
    body: 'We built a PowerShell-based onboarding toolkit. Creates accounts, deploys agents, configures monitoring - all from a single config file. Cut onboarding from 2 weeks to 2 days.',
    score: 89,
    created_utc: Date.now() / 1000 - 86400 * 6.9,
    is_submitter: false,
  },
  {
    id: 'comment_4_2',
    post_id: 'demo_post_4',
    parent_id: 'demo_post_4',
    depth: 0,
    author: 'msp_operations',
    body: 'Client onboarding is our biggest bottleneck too. Would love a SaaS tool that standardizes this process. I\'d pay $200/client for a smooth onboarding experience.',
    score: 67,
    created_utc: Date.now() / 1000 - 86400 * 6.8,
    is_submitter: false,
  },
  {
    id: 'comment_4_3',
    post_id: 'demo_post_4',
    parent_id: 'comment_4_1',
    depth: 1,
    author: 'msp_tech_lead',
    body: 'Any chance you could share that toolkit? Or is it proprietary?',
    score: 34,
    created_utc: Date.now() / 1000 - 86400 * 6.7,
    is_submitter: true,
  },

  // Comments for demo_post_5 (alert fatigue)
  {
    id: 'comment_5_1',
    post_id: 'demo_post_5',
    parent_id: 'demo_post_5',
    depth: 0,
    author: 'aiops_advocate',
    body: 'We implemented BigPanda for alert correlation. Reduced actionable alerts by 70%. Expensive but the ROI was clear within 3 months.',
    score: 78,
    created_utc: Date.now() / 1000 - 86400 * 3.9,
    is_submitter: false,
  },
  {
    id: 'comment_5_2',
    post_id: 'demo_post_5',
    parent_id: 'demo_post_5',
    depth: 0,
    author: 'burnt_out_admin',
    body: 'Alert fatigue is the #1 reason people leave NOC jobs. We need smarter tools that understand context, not just thresholds. Someone should build an AI that learns from our environment.',
    score: 112,
    created_utc: Date.now() / 1000 - 86400 * 3.8,
    is_submitter: false,
  },
  {
    id: 'comment_5_3',
    post_id: 'demo_post_5',
    parent_id: 'comment_5_1',
    depth: 1,
    author: 'noc_manager',
    body: 'How much is BigPanda running you? We need to build a business case for the budget.',
    score: 34,
    created_utc: Date.now() / 1000 - 86400 * 3.7,
    is_submitter: true,
  },
  {
    id: 'comment_5_4',
    post_id: 'demo_post_5',
    parent_id: 'comment_5_3',
    depth: 2,
    author: 'aiops_advocate',
    body: 'About $50k/year for our environment (2000 nodes). Definitely enterprise pricing but the time savings justified it.',
    score: 45,
    created_utc: Date.now() / 1000 - 86400 * 3.6,
    is_submitter: false,
  },
];

// Combine all posts and comments
const ALL_DEMO_POSTS = [...DEMO_POSTS, ...ADDITIONAL_DEMO_POSTS];
const ALL_DEMO_COMMENTS = [...DEMO_COMMENTS, ...ADDITIONAL_DEMO_COMMENTS];

/**
 * Load demo data into the database
 */
export function loadDemoData(): {
  subreddits: number;
  posts: number;
  comments: number;
} {
  // Insert subreddits
  for (const sub of DEMO_SUBREDDITS) {
    upsertSubreddit(sub);
  }

  // Insert all posts
  for (const post of ALL_DEMO_POSTS) {
    upsertPost(post);
  }

  // Insert all comments
  upsertComments(ALL_DEMO_COMMENTS);

  // Create thread records for all posts
  for (const post of ALL_DEMO_POSTS) {
    const postComments = ALL_DEMO_COMMENTS.filter(c => c.post_id === post.id);
    const uniqueAuthors = new Set(postComments.map(c => c.author));
    uniqueAuthors.add(post.author);

    const thread: Thread = {
      id: post.id,
      post_id: post.id,
      subreddit: post.subreddit,
      comment_count: postComments.length,
      unique_authors: uniqueAuthors.size,
      max_depth: Math.max(...postComments.map(c => c.depth), 0),
      truncated: false,
    };
    upsertThread(thread);
  }

  return {
    subreddits: DEMO_SUBREDDITS.length,
    posts: ALL_DEMO_POSTS.length,
    comments: ALL_DEMO_COMMENTS.length,
  };
}

export default {
  DEMO_SUBREDDITS,
  DEMO_POSTS,
  DEMO_COMMENTS,
  loadDemoData,
};
