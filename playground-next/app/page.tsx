import { Controls } from './controls';

export default function Page() {
  return (
    <div className="page">
      <h1>xray next fixture</h1>
      <Controls />
      <div className="tokenised">tokenised: padding and radius come from var()</div>
      <button className="hardcoded" type="button">
        hardcoded 8px / 4px
      </button>
    </div>
  );
}
