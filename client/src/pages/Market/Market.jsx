import { useSearchParams } from 'react-router-dom';
import useBubble from '../../hooks/useBubble';
import useUser from '../../hooks/useUser';
import StarsShop from './StarsShop/StarsShop';
import SunsConvert from './SunsConvert/SunsConvert';
import Spin from './Spin/Spin';
import Powerups from './Powerups/Powerups';
import './Market.css';

const SECTIONS = [
  { id: 'stars', label: 'Stars', title: 'Stars for Minor Polls', blurb: 'Choose a Stars package for your account.' },
  { id: 'suns', label: 'Suns', title: 'Sun Conversion', blurb: 'Convert Suns to Stars for Votes.' },
  { id: 'spin', label: 'Spin', title: 'Spin', blurb: 'Try your luck and earn Stars.' },
  { id: 'powerups', label: 'Powerups', title: 'Powerups', blurb: 'Boost the impact of your votes.' }
];

// Same shell as the Community page: sidebar with a sliding white bubble, section picked by ?tab=
export default function Market() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = SECTIONS.some((s) => s.id === requested) ? requested : 'stars';
  const bubble = useBubble(active);

  const choose = (id) => setParams(id === 'stars' ? {} : { tab: id }, { replace: true });
  const current = SECTIONS.find((s) => s.id === active);

  return (
    <div className="market-page">
      <aside className="mk-sidebar rise">
        <nav className="mk-nav" aria-label="Market sections">
          {bubble.style && <span className="mk-bubble" style={bubble.style} />}
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              ref={bubble.setRef(s.id)}
              className={`mk-tab${active === s.id ? ' active' : ''}`}
              aria-current={active === s.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="mk-main">
        <header className={`mk-head${active === 'suns' ? ' centered' : ''}`} key={`h-${active}`}>
          <h1 className="mk-title">{current.title}</h1>
          <p className="mk-blurb">{current.blurb}</p>
        </header>
        <div className={`mk-section${active === 'suns' ? ' centered' : ''}`} key={active}>
          {active === 'stars' && <StarsShop />}
          {active === 'suns' && <SunsConvert user={user} />}
          {active === 'spin' && <Spin user={user} />}
          {active === 'powerups' && <Powerups />}
        </div>
      </main>
    </div>
  );
}
