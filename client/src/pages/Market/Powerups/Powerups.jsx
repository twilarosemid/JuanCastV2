import NunuLogo from '../../../assets/nunu_sa_punso_logo.webp';
import AgimatLogo from '../../../assets/agimat_ni_juan_logo.webp';
import ApolakiLogo from '../../../assets/apolaki_logo.webp';
import './Powerups.css';

const powerups = [
  { name: 'Nuno sa Punso', detail: 'Stars voted will be multiplied 3x', duration: '30 min', price: 5999, image: NunuLogo },
  { name: 'Agimat ni Juan', detail: 'Stars voted will be multiplied 2x', duration: '60 min', price: 1499, image: AgimatLogo },
  { name: 'Apolaki', detail: 'Suns voted will be multiplied 2x', duration: '30 min', price: 2999, image: ApolakiLogo }
];

export default function Powerups() {
  return (
    <>
      <div className="powerup-grid">
        {powerups.map(({ name, detail, duration, price, image }, i) => (
          <article className="mk-card powerup-card" key={name} style={{ '--i': i }}>
            <span className="powerup-duration">{duration}</span>
            <img className="powerup-icon" src={image} alt="" />
            <h2>{name}</h2>
            <p>{detail}</p>
            <strong className="mk-price">PHP {price.toLocaleString()}</strong>
          </article>
        ))}
      </div>
      <p className="mk-note">Powerup checkout is not available yet.</p>
    </>
  );
}
