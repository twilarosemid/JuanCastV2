import useCountUp from '../../hooks/useCountUp';

// <CountUp value={1234} /> -> animates up to "1,234"
export default function CountUp({ value, duration }) {
  const n = useCountUp(value, duration);
  return <>{new Intl.NumberFormat('en-US').format(n)}</>;
}
