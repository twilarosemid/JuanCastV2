// Run from your client folder:  node apply-routes.js
// Hooks the new pages into the app: routes in App.jsx, Rewards link in Profile + the account menu.
// Each edit must match exactly once; if something does not match it is reported and left alone.
const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd(), 'src');

const edits = [
  // ---- App.jsx: routes
  ['App.jsx',
`import Market from './pages/Market/Market.jsx';
`,
`import Market from './pages/Market/Market.jsx';
import Rewards from './pages/Rewards/Rewards.jsx';
import ChikaArticle from './pages/Chika/ChikaArticle.jsx';
`],
  ['App.jsx',
`          <Route path="/market" element={<Market />} />
`,
`          <Route path="/community/chika/:id" element={<ChikaArticle />} />
          <Route path="/market" element={<Market />} />
          <Route path="/rewards" element={<Rewards />} />
`],

  // ---- Profile.jsx: Rewards is a page now
  ['pages/Profile/Profile.jsx',
`import RewardsCenter from '../../components/RewardsCenter/RewardsCenter';
`, ``],
  ['pages/Profile/Profile.jsx',
`  const [rewardsOpen, setRewardsOpen] = useState(false);
`, ``],
  ['pages/Profile/Profile.jsx',
`onClick={() => f.id === 'rewards' && setRewardsOpen(true)}`,
`onClick={() => f.id === 'rewards' && navigate('/rewards')}`],
  ['pages/Profile/Profile.jsx',
`          <RewardsCenter
            open={rewardsOpen}
            onClose={() => setRewardsOpen(false)}
            user={viewer}
            dailyStreak={daily.streak}
            onOpenDaily={() => setDailyOpen(true)}
          />
`, ``],

  // ---- Navbar.jsx: Rewards in the account menu
  ['components/Navbar/Navbar.jsx',
`const ShieldIcon = () => (`,
`const RewardsIcon = () => (
  <Icon><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></Icon>
);
const ShieldIcon = () => (`],
  ['components/Navbar/Navbar.jsx',
`                <Link role="menuitem" to={LINKS.transactions}><TransactionsIcon /> Transactions</Link>
                {isAdminUser(user)`,
`                <Link role="menuitem" to="/rewards"><RewardsIcon /> Rewards</Link>
                <Link role="menuitem" to={LINKS.transactions}><TransactionsIcon /> Transactions</Link>
                {isAdminUser(user)`]
];

let applied = 0, problems = 0;
for (const [file, find, repl] of edits) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { console.log('MISSING  ', file); problems++; continue; }
  const text = fs.readFileSync(full, 'utf8');
  const crlf = text.includes('\r\n');
  const f = crlf ? find.replace(/\n/g, '\r\n') : find;
  const r = crlf ? repl.replace(/\n/g, '\r\n') : repl;
  const n = text.split(f).length - 1;
  if (n === 1) { fs.writeFileSync(full, text.replace(f, () => r)); console.log('done     ', file); applied++; }
  else if (n === 0) { console.log('NO MATCH (already changed, or differs from mine)', file, '->', find.trim().split('\n')[0].slice(0, 70)); problems++; }
  else { console.log('AMBIGUOUS', file, n); problems++; }
}
console.log(`\n${applied} edit(s) applied, ${problems} skipped.`);
