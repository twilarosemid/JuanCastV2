import { useEffect, useState } from 'react';
import { getJSON } from '../../api';
import Navbar from '../../components/Navbar/Navbar';
import HeroCarousel from '../../components/HeroCarousel/HeroCarousel';
import ScrollWash from '../../components/ScrollWash/ScrollWash';
import RankingRow from '../../components/RankingRow/RankingRow';
import PollsCarousel from '../../components/PollsCarousel/PollsCarousel';
import ChikaGrid from '../../components/ChikaGrid/ChikaGrid';
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
      <ScrollWash />
      <div className="vignette" />
      <Navbar />
      <main>
        <div className="sheet">
          <RankingRow />
          <PollsCarousel />
          <ChikaGrid />
          <div id="market" className="spacer" />
        </div>
      </main>
    </>
  );
}
