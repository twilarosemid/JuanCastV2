import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getJSON, img, getUser, saveUser, castVote } from '../../api';
import Modal from '../../components/Modal/Modal';
import Reveal from '../../components/Reveal/Reveal';
import CountUp from '../../components/CountUp/CountUp';
// reuse the Home podium styles so this page looks like the rest of the system
import '../../components/RankingRow/RankingRow.css';
import './Polls.css';

const bg = (url) => (url ? { backgroundImage: `url("${img(url)}")` } : {});

export default function PollDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [poll, setPoll] = useState(null);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [voteAmount, setVoteAmount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [flashId, setFlashId] = useState(null); // artist that was just voted for
  const [feedback, setFeedback] = useState({ isOpen: false, message: '', type: 'success' });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLiveTime = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${yyyy}-${mm}-${dd} ${time} PHT`;
  };

  const pickArtists = (rankings, p) =>
    rankings
      .filter((r) => r.group === p.group && r.category === p.title)
      .sort((a, b) => Number(b.voteCount) - Number(a.voteCount));

  useEffect(() => {
    (async () => {
      try {
        const [polls, rankings] = await Promise.all([getJSON('/api/polls'), getJSON('/api/rankings')]);
        const current = polls.find((p) => p._id === id || p.id === id);
        setPoll(current || null);
        if (current) setArtists(pickArtists(rankings, current));
      } catch (error) {
        console.error('Error fetching poll details:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isPollEnded = poll ? now > new Date(poll.toDate) : false;

  const openVoteModal = (artist) => {
    if (isPollEnded) {
      setFeedback({ isOpen: true, message: 'This poll has already ended.', type: 'error' });
      return;
    }
    const user = getUser();
    if (!user?.email) {
      navigate('/login');
      return;
    }
    setSelected(artist);
    setVoteAmount(1);
    setVoteModalOpen(true);
  };

  const confirmVote = async () => {
    if (!selected || voteAmount <= 0 || submitting) return;
    setSubmitting(true);
    try {
      const user = getUser();
      const votedId = selected._id || selected.id;
      const result = await castVote(votedId, user, voteAmount);

      const fresh = await getJSON('/api/rankings');
      setArtists(pickArtists(fresh, poll));

      // keep the saved user's balance in sync (the navbar listens for this)
      saveUser({
        ...user,
        stars: result.remainingStars,
        ...(result.remainingSuns !== undefined ? { suns: result.remainingSuns } : {})
      });

      setFlashId(votedId);
      setTimeout(() => setFlashId(null), 1600);

      setFeedback({
        isOpen: true,
        message: `Successfully voted with ${voteAmount} Star(s)!\nRemaining: ${result.remainingStars}`,
        type: 'success'
      });
      setVoteModalOpen(false);
    } catch (error) {
      setFeedback({ isOpen: true, message: error.message || 'Error casting vote.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const closeFeedback = () => setFeedback((f) => ({ ...f, isOpen: false }));

  const formatPollDates = (start, end) => {
    const opts = { month: 'long', day: 'numeric', year: 'numeric' };
    const s = new Date(start).toLocaleDateString('en-US', opts);
    const e = new Date(end).toLocaleDateString('en-US', opts);
    const t = new Date(end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${s} – ${e} at ${t}`;
  };

  if (loading) {
    return (
      <div className="poll-detail" aria-busy="true">
        <div className="skeleton poll-banner-skeleton" />
        <div className="skeleton skeleton-block" />
      </div>
    );
  }
  if (!poll) return <div className="polls-status rise">Poll not found.</div>;

  const top = artists.slice(0, 3);
  const rest = artists.slice(3);
  const entries = top.map((artist, rank) => ({ artist, rank }));
  const podium = [1, 0, 2].map((i) => entries[i]).filter(Boolean); // 2nd, 1st, 3rd
  const leaderVotes = Number(artists[0]?.voteCount) || 0;

  const voteBtn = (artist) => (
    <button
      className="vote"
      onClick={() => openVoteModal(artist)}
      disabled={isPollEnded}
      title={isPollEnded ? 'Poll has ended' : 'Cast vote'}
    >
      Vote
    </button>
  );

  return (
    <div className="poll-detail">
      <Link to="/polls" className="back-link rise">← All polls</Link>

      <div className="poll-banner rise" style={{ '--d': '60ms' }}>
        <div
          className="poll-banner-img"
          style={{ backgroundImage: poll.imageUrl ? `url("${img(poll.imageUrl)}")` : 'none' }}
        />
      </div>

      <section className="poll-info rise" style={{ '--d': '140ms' }}>
        <div className="poll-timer">
          {!isPollEnded && <span className="live-dot" aria-hidden="true" />}
          {formatLiveTime(now)}
        </div>
        <h1>{poll.title}{isPollEnded ? ' (ENDED)' : ''}</h1>
        <div className="poll-dates">{formatPollDates(poll.fromDate, poll.toDate)}</div>
        <div className="poll-type">{poll.type}</div>
        <p>{poll.description || 'Show your support and cast your votes!'}</p>
      </section>

      <section className="artist-list">
        {artists.length === 0 ? (
          <div className="polls-empty rise">No artists assigned to this poll yet.</div>
        ) : (
          <>
            <div className="podium">
              {podium.map(({ artist, rank }, n) => (
                <Reveal
                  key={artist._id}
                  className={`slot r${rank + 1} ${flashId === artist._id ? 'flash' : ''}`}
                  delay={n * 120}
                >
                  <div className="poster" style={bg(artist.imageUrl)} role="img" aria-label={artist.name}>
                    <span className="rank">#{rank + 1}</span>
                  </div>
                  <div className="info">
                    <div>
                      <h3>{artist.name}</h3>
                      <small><CountUp value={artist.voteCount} /> votes</small>
                    </div>
                    {voteBtn(artist)}
                  </div>
                </Reveal>
              ))}
            </div>

            {rest.length > 0 && (
              <ul className="others">
                {rest.map((artist, i) => (
                  <li
                    key={artist._id}
                    className={flashId === artist._id ? 'flash' : ''}
                    style={{ '--i': i }}
                  >
                    <span className="n">{i + 4}</span>
                    <span className="av" style={bg(artist.imageUrl)} role="img" aria-label={artist.name} />
                    <span className="nm">{artist.name}</span>
                    <span className="vt"><CountUp value={artist.voteCount} /></span>
                    {voteBtn(artist)}
                    <span
                      className="share"
                      style={{ '--w': leaderVotes ? Math.max(0.02, Number(artist.voteCount) / leaderVotes) : 0 }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <Modal open={voteModalOpen} onClose={() => setVoteModalOpen(false)} label="Cast your vote">
        <h3>Cast Your Vote</h3>
        <p>Voting for: <strong>{selected?.name}</strong></p>
        <label htmlFor="vote-amount">Number of Stars to use</label>
        <div className="stepper">
          <button type="button" aria-label="Fewer stars" onClick={() => setVoteAmount((v) => Math.max(1, v - 1))}>−</button>
          <input
            id="vote-amount"
            type="number"
            min="1"
            value={voteAmount}
            onChange={(e) => setVoteAmount(Number(e.target.value))}
          />
          <button type="button" aria-label="More stars" onClick={() => setVoteAmount((v) => v + 1)}>+</button>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={() => setVoteModalOpen(false)}>Cancel</button>
          <button className="btn-solid" onClick={confirmVote} disabled={submitting}>
            {submitting ? 'Voting…' : 'Confirm Vote'}
          </button>
        </div>
      </Modal>

      <Modal open={feedback.isOpen} onClose={closeFeedback} role="alertdialog" label={feedback.type === 'success' ? 'Success' : 'Error'}>
        <div className="center">
          <div className={`fb-icon ${feedback.type}`}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle className="ring" cx="32" cy="32" r="28" />
              {feedback.type === 'success'
                ? <path className="mark" d="M20 33l8 8 16-17" />
                : <path className="mark" d="M22 22l20 20M42 22L22 42" />}
            </svg>
          </div>
          <h3 className={feedback.type}>{feedback.type === 'success' ? 'Success!' : 'Oops!'}</h3>
          <p className="feedback-message">{feedback.message}</p>
          <button className="btn-solid" onClick={closeFeedback}>Got it</button>
        </div>
      </Modal>
    </div>
  );
}
