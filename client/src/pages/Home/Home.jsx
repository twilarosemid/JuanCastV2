import { useEffect, useState } from 'react';
import { getJSON } from '../../api';
import HeroCarousel from '../../components/HeroCarousel/HeroCarousel';
import RankingRow from '../../components/RankingRow/RankingRow';
import PollsCarousel from '../../components/PollsCarousel/PollsCarousel';
import Reveal from '../../components/Reveal/Reveal';
import HomeFeed from '../../components/HomeFeed/HomeFeed';
import './Home.css';

export default function Home() {
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    getJSON('/api/banners')
      // oldest first so the order matches how you uploaded them
      .then((list) => setBanners([...list].reverse()))
      .catch(console.error);
  }, []);

  return (
    <>
      <HeroCarousel banners={banners} />
      <main>
        <div className="sheet">
          <Reveal><RankingRow /></Reveal>
          <Reveal delay={80}><PollsCarousel /></Reveal>
          <HomeFeed />
          <div id="market" className="spacer" />
        </div>
      </main>
    </>
  );
}
