import { Link } from 'react-router-dom';
import BoardPanel from '../BoardPanel/BoardPanel';
import ArtistsPanel from '../ArtistsPanel/ArtistsPanel';
import Reveal from '../Reveal/Reveal';
import './HomeFeed.css';

// Community board on the left, the featured group's Artists on the right (stacked on small screens)
export default function HomeFeed() {
  return (
    <div className="feed">
      <Reveal as="section">
        <div className="section-head">
          <h2 className="section-title" id="chat">Community Board</h2>
          <Link to="/community">View All <span aria-hidden="true">→</span></Link>
        </div>
        <BoardPanel compact />
      </Reveal>
      <Reveal as="section" delay={120}>
        <ArtistsPanel />
      </Reveal>
    </div>
  );
}
