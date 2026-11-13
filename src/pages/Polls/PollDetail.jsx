import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getJSON, img, getUser, isArtistUser } from '../../api';
import Modal from '../../components/Modal/Modal';
import VoteModal from '../../components/VoteModal/VoteModal';
import ServerClock from '../../components/ServerClock/ServerClock';
import PollStatus from '../../components/PollStatus/PollStatus';
import { formatDateTime } from '../../utils/pollTime';
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

  // fan project: a poll with a goal shows a progress bar of all votes cast so far
  const goal = Math.max(0, Number(poll?.goal) || 0);
  const total = artists.reduce((sum, a) => sum + (Number(a.voteCount) || 0), 0);
  const goalPct = goal ? Math.min(100, (total / goal) * 100) : 0;
  const goalReached = goal > 0 && total >= goal;
  const [barPct, setBarPct] = useState(0); // starts empty so the bar fills in when the page opens
  useEffect(() => {
    const id = setTimeout(() => setBarPct(goalPct), 250);
    return () => clearTimeout(id);
  }, [goalPct]);

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
    setVoteModalOpen(true);
  };

  // the VoteModal casts the vote itself; this just refreshes the page once it went through
  const handleVoted = async ({ artist, amount, result, currency }) => {
    setVoteModalOpen(false);
    const votedId = artist._id || artist.id;
    try {
      const fresh = await getJSON('/api/rankings');
      setArtists(pickArtists(fresh, poll));
    } catch (error) {
      console.error('Error refreshing rankings:', error);
    }
    setFlashId(votedId);
    setTimeout(() => setFlashId(null), 1600);
    setFeedback({
      isOpen: true,
      message: `You cast ${amount.toLocaleString('en-US')} ${currency === 'suns' ? 'Sun(s)' : 'Star(s)'} for ${artist.name}!\nRemaining: ${Number(currency === 'suns' ? result.remainingSuns : result.remainingStars).toLocaleString('en-US')}`,
      type: 'success'
    });
  };

  const closeFeedback = () => setFeedback((f) => ({ ...f, isOpen: false }));

  if (loading) {
    return (
      <div className="poll-detail" aria-busy="true" />
    );
  }
  if (!poll) return <div className="polls-status rise">Poll not found.</div>;

  const soloArtist = goal > 0 && artists.length === 1 ? artists[0] : null;
  const top = artists.slice(0, 3);
  const rest = artists.slice(3);
  const entries = top.map((artist, rank) => ({ artist, rank }));
  const podium = [1, 0, 2].map((i) => entries[i]).filter(Boolean); // 2nd, 1st, 3rd
  const leaderVotes = Number(artists[0]?.voteCount) || 0;

  // an entry linked to an artist account links to that artist's profile
  const nameOf = (artist) => (artist.profileUsername
    ? <Link className="artist-profile-link" to={`/profile/${artist.profileUsername}`}>{artist.name}</Link>
    : artist.name);

  // artist accounts can look at polls but not vote
  const canVote = !isArtistUser(getUser());

  const voteBtn = (artist) => (!canVote ? null : (
    <button
      className="vote"
      onClick={() => openVoteModal(artist)}
      disabled={isPollEnded}
      title={isPollEnded ? 'Poll has ended' : 'Cast vote'}
    >
      Cast Vote
    </button>
  ));

  return (
    <div className="poll-detail">
      <Link to="/polls" className="back-link rise">← All polls</Link>

      <div className="poll-banner rise" style={{ '--d': '60ms' }}>
        <div
          className="poll-banner-img"
          style={{ backgroundImage: poll.imageUrl ? `url("${img(poll.imageUrl)}")` : 'none' }}
        />
      </div>

      <ServerClock text={formatLiveTime(now)} live={!isPollEnded} />

      <section className="poll-info rise" style={{ '--d': '140ms' }}>
        <h1>{poll.title.replace(/\s*\(ended\)\s*$/i, '')}</h1>
        <div className="poll-status-row">
          <PollStatus poll={poll} now={now} inline />
          <PollStatus poll={poll} now={now} show="left" />
        </div>
        <div className="poll-when">
          <span><b>Start</b>{formatDateTime(poll.fromDate)}</span>
          <span><b>End</b>{formatDateTime(poll.toDate)}</span>
        </div>
        <div className="poll-type">{poll.type}</div>
        <p>{poll.description || 'Show your support and cast your votes!'}</p>
      </section>

      {goal > 0 && (
        <div className={`goal rise${goalReached ? ' reached' : ''}`} style={{ '--d': '100ms' }}>
          <div
            className="goal-track"
            role="progressbar"
            aria-label="Fan project goal"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(total, goal)}
          >
            <div className="goal-head">
              <span className="goal-label">Suns collected</span>
              <span className="goal-count"><CountUp value={total} /> / {goal.toLocaleString('en-US')}</span>
            </div>
            <div className="goal-bar"><div className="goal-fill" style={{ width: `${barPct}%` }} /></div>
          </div>
          <div className="goal-foot">
            <p className="goal-note">
              {goalReached ? 'Goal reached! Thank you for the support.' : `${(goal - total).toLocaleString('en-US')} more to reach the goal`}
            </p>
            {soloArtist && canVote && (
              <button
                type="button"
                className="btn-solid goal-vote"
                onClick={() => openVoteModal(soloArtist)}
                disabled={isPollEnded}
                title={isPollEnded ? 'Poll has ended' : 'Cast vote'}
              >
                Cast Vote
              </button>
            )}
          </div>
        </div>
      )}


      {!soloArtist && <section className="artist-list">
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
                      <h3>{nameOf(artist)}</h3>
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
                    <span className="nm">{nameOf(artist)}</span>
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
      </section>}

      <VoteModal
        open={voteModalOpen}
        artist={selected}
        pollTitle={poll.title}
        currency={goal > 0 ? 'suns' : 'stars'}
        onClose={() => setVoteModalOpen(false)}
        onVoted={handleVoted}
      />

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
