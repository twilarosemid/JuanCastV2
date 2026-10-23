import { Link } from 'react-router-dom';
import ChatPanel from '../ChatPanel/ChatPanel';
import ChikaPanel from '../ChikaPanel/ChikaPanel';
import Reveal from '../Reveal/Reveal';
import './HomeFeed.css';

// Community chat on the left, Latest Chika on the right (stacked on small screens)
export default function HomeFeed() {
  return (
    <div className="feed">
      <Reveal as="section">
        <div className="section-head">
          <h2 className="section-title" id="chat">Community Chat</h2>
          <Link to="/community">View All</Link>
        </div>
        <ChatPanel />
      </Reveal>
      <Reveal as="section" delay={120}>
        <div className="section-head">
          <h2 className="section-title" id="chika">Latest Chika</h2>
        </div>
        <ChikaPanel />
      </Reveal>
    </div>
  );
}
