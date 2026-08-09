import { Bench } from "@/components/Bench";
import { CopyCommand } from "@/components/CopyCommand";
import { Instruments } from "@/components/Instruments";
import { InspectTrigger } from "@/components/InspectTrigger";
import { Panel } from "@/components/Panel";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const REPO = "https://github.com/stevenmckinnon/xray";

/**
 * A labelled config snippet.
 *
 * There are two setups to show now, and the label is what stops the second block
 * reading as a continuation of the first.
 */
function Snippet({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="mono text-[11px] tracking-[0.14em] uppercase" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <pre
        className="mono overflow-x-auto rounded-[var(--radius-control)] p-4 text-[12px] leading-relaxed"
        style={{
          border: "1px solid var(--border-strong)",
          background: "var(--surface-sunken)",
          color: "var(--text-muted)",
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {/* ---------------------------------------------------------------- hero */}
      <header className="shell pt-8 pb-4">
        <nav className="flex flex-wrap items-center justify-between gap-4 pb-14">
          <span className="mono text-[13px] tracking-[0.2em] uppercase">
            xray<span style={{ color: "var(--text-accent)" }}>.</span>
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden sm:contents">
              <Instruments />
            </span>
            <a className="btn" href={REPO}>
              <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={2} aria-hidden="true" />
              GitHub
            </a>
          </div>
        </nav>

        <div className="grid items-start gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,46%)]">
          {/* Four text elements, no more: headline, subtext, CTA, live hint. */}
          <div className="stagger flex flex-col gap-6">
            <h1 className="display text-[clamp(2.6rem,1.2rem+5.2vw,5rem)]">
              8px is correct at exactly one density.
            </h1>

            <p className="lede">
              xray maps an element&rsquo;s <em>computed</em> styles back to your
              design tokens, then flags every value that only works in the theme
              you happen to be looking at.
            </p>

            <CopyCommand
              manager="npm i"
              flags="-D"
              pkg="@stevenmckinnon/xray"
            />

            {/* A clickable way in, with the shortcut as a hint rather than the
                only door. Quiet on purpose: the install command above is the CTA. */}
            <InspectTrigger />
          </div>

          {/* The page annotating itself with its own tokens. */}
          <div className="hidden self-stretch lg:flex" aria-hidden="true">
            <div className="dim-v" style={{ animationDelay: "520ms" }}>
              <span className="dim-label">--spacing-gutter</span>
            </div>
          </div>

          <div
            className="rise flex flex-col gap-3"
            style={{ animationDelay: "260ms" }}
          >
            <Panel />
            <p
              className="mono text-[10px] tracking-[0.12em] uppercase"
              style={{ color: "var(--text-faint)" }}
            >
              Generated from the real tool. @salt-ds/theme, 1,831 tokens, five
              densities.
            </p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- argument */}
      <section className="section shell">
        <div className="section-head">
          <h2 className="section-title">
            One of these buttons is lying about being finished.
          </h2>
          <p className="prose-note">
            Both look right at <strong>regular</strong> density. The one on the
            left is built from this page&rsquo;s tokens. The one on the right
            hardcodes the numbers those tokens happen to hold. Change the
            density and watch which one moves.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <Instruments />
          <Bench />
          <p className="prose-note text-[0.94rem]">
            Nobody argues with a bug. Everybody argues with a style guide. So
            xray leads with{" "}
            <em>this renders wrong at four of five densities</em> rather than{" "}
            <em>this does not follow the design system</em>.
          </p>
          <p
            className="mono text-[11px]"
            style={{ color: "var(--text-faint)" }}
          >
            Hover the Forked button with the overlay open and it reports all
            five. The overlay owns your clicks while it is up, the way any
            inspect mode does, so flip these axes from its own chips instead.
            Esc hands the page back.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- kinds */}
      <section className="section shell">
        <div className="section-head">
          <h2 className="section-title">
            Four verdicts, ranked by whether they can actually hurt you.
          </h2>
        </div>

        {/*
          Four items, four cells, weighted. `locked` is the verdict that matters,
          so it gets the tall cell and a real variant table rather than equal
          billing in a row of identical boxes.
        */}
        <div className="verdicts">
          <article className="card card-lead">
            <span className="badge card-kind" data-kind="locked">
              locked
            </span>
            <h3 className="card-title">Locked to one variant</h3>
            <p className="card-body">
              The literal equals a token that <em>varies</em> across a theme,
              mode or density axis. Correct in the variant you are viewing.
              Wrong in the others, silently, until someone switches theme.
            </p>
            <table className="variant-table">
              <tbody>
                <tr data-wrong="true">
                  <td>high</td>
                  <td className="v">20px</td>
                </tr>
                <tr data-wrong="true">
                  <td>low</td>
                  <td className="v">36px</td>
                </tr>
                <tr data-active="true">
                  <td>medium ·</td>
                  <td className="v">28px</td>
                </tr>
                <tr data-wrong="true">
                  <td>touch</td>
                  <td className="v">44px</td>
                </tr>
              </tbody>
            </table>
            <p className="card-example">
              height: 28px is --salt-size-base at medium only
            </p>
          </article>

          <article className="card">
            <span className="badge card-kind" data-kind="off-scale">
              off-scale
            </span>
            <h3 className="card-title">Off-scale by a hair</h3>
            <p className="card-body">
              Perceptually within ΔE 0.02 of a token, but not equal to it. Close
              enough that nobody sees it, far enough to escape every theme.
            </p>
            <div className="swatch-pair" aria-hidden="true">
              <span className="swatch" style={{ background: "#fefefe" }} />
              <span className="swatch" style={{ background: "#ffffff" }} />
            </div>
            <p className="card-example">
              #fefefe, 0.003 from --salt-color-white
            </p>
          </article>

          <article className="card">
            <span className="badge card-kind" data-kind="drift">
              drift
            </span>
            <h3 className="card-title">Quiet drift</h3>
            <p className="card-body">
              Equals a token that never varies. Nothing breaks today. It simply
              will not follow the token when the token moves.
            </p>
            <p className="card-example">
              1px, exactly --salt-size-divider-strokeWidth
            </p>
          </article>

          <article className="card">
            <span className="badge card-kind" data-kind="ok">
              ok
            </span>
            <h3 className="card-title">Tokenised</h3>
            <p className="card-body">
              Resolves through a token that is genuinely in scope. Reported too,
              so a clean element reads as clean rather than as silence.
            </p>
            <p className="card-example">padding: 0 var(--salt-spacing-100)</p>
          </article>
        </div>

        <p className="prose-note mt-8">
          Findings only appear for properties the author actually set, because
          browser defaults are not your problem. Per-side longhands collapse:
          four identical corners are one{" "}
          <span className="mono">border-radius</span> row, and{" "}
          <span className="mono">padding: 8px 16px</span> is two rows rather
          than four.
        </p>
      </section>

      {/* ------------------------------------------------------------ mechanism */}
      <section className="section shell">
        <div className="section-head">
          <h2 className="section-title">
            Every other token linter reads source text.
          </h2>
          <p className="prose-note">
            Which is why they can tell you{" "}
            <span className="mono">padding: 8px</span> is not a{" "}
            <span className="mono">var()</span>, and cannot tell you that{" "}
            <span className="mono">8px</span> <strong>is</strong>{" "}
            <span className="mono">--salt-spacing-100</span>, that the token
            resolves to four different values across four densities, and that
            this element is therefore correct at exactly one of them. That needs
            the cascade resolved. Resolving the cascade needs a browser.
          </p>
        </div>

        <div>
          <div className="beat">
            <span className="beat-n">01</span>
            <div>
              <h3 className="beat-title">
                Tokens resolve by asking the browser
              </h3>
              <p className="beat-body">
                The computed value of a custom property is the substituted token
                stream: <code>calc(0.5 * 8px)</code>, not <code>4px</code>. So
                instead of writing a calc evaluator, xray puts a probe inside
                the element you are inspecting, declares{" "}
                <code>letter-spacing: var(--token)</code> on it, and reads the
                computed length back. Anything the engine can resolve, xray can
                read, including nested <code>var()</code> chains,{" "}
                <code>calc()</code>, <code>rem</code>, <code>em</code> and{" "}
                <code>oklch()</code>.
              </p>
            </div>
          </div>

          <div className="beat">
            <span className="beat-n">02</span>
            <div>
              <h3 className="beat-title">
                Axes are discovered, not configured
              </h3>
              <p className="beat-body">
                A token declared once is a constant. A token declared under
                several selectors with different values varies, and the
                conditions those selectors disagree on <em>are</em> the axis.
                That finds Salt&rsquo;s five densities from classes, its light
                and dark from <code>[data-mode]</code> attributes, and a shadcn{" "}
                <code>:root</code> and <code>.dark</code> pair where one side
                has no condition at all. No adapters, no token manifest.
              </p>
            </div>
          </div>

          <div className="beat">
            <span className="beat-n">03</span>
            <div>
              <h3 className="beat-title">
                The cascade is modelled, not guessed
              </h3>
              <p className="beat-body">
                <code>getComputedStyle</code> cannot tell you whether the author
                wrote <code>8px</code> or <code>var(--spacing-100)</code>,
                because it has already erased the difference. So xray collects
                every readable rule, matches them against the element itself,
                and sorts by importance, origin, <code>@layer</code>,
                specificity and document order to recover what was actually
                authored.
              </p>
            </div>
          </div>

          <div className="beat">
            <span className="beat-n">04</span>
            <div>
              <h3 className="beat-title">It refuses to guess</h3>
              <p className="beat-body">
                Between 1px and 48px there are enough tokens that <em>every</em>{" "}
                literal collides with one. A match whose name has nothing to do
                with the property is reported as untokenised rather than as a
                bug, because <code>padding: 13px</code> equalling a{" "}
                <code>lineHeight</code> token is arithmetic, not intent. A tool
                that cries wolf gets muted.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- install */}
      <section className="section shell">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            {/* Not "two lines" any more: the Next setup below it takes four, and
                this page's whole character is not overstating things. */}
            <h2 className="section-title">A few lines, then a keystroke.</h2>
            <CopyCommand
              manager="npm i"
              flags="-D"
              pkg="@stevenmckinnon/xray"
            />
            <Snippet label="Vite">{`// vite.config.ts
import xray from '@stevenmckinnon/xray';

export default defineConfig({
  plugins: [xray(), react()],
});`}</Snippet>
            <Snippet label="Next.js">{`// next.config.ts
import { withXray } from '@stevenmckinnon/xray/next';

export default withXray({ /* your config */ });

// app/layout.tsx — once, inside <body>
import { Xray } from '@stevenmckinnon/xray/next/client';
<Xray />`}</Snippet>
            <p className="prose-note">
              Neither integration exists in a production build. The Vite plugin
              is <span className="mono">apply: &lsquo;serve&rsquo;</span>;{" "}
              <span className="mono">withXray</span> returns your config
              untouched outside development. The dev server prints the binding on
              start, so you never have to guess it.
            </p>
            <div className="flex flex-wrap gap-3">
              <a className="btn btn-primary" href={REPO}>
                Read the docs
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <h2 className="section-title">The honest list.</h2>
            <dl className="limits">
              <div>
                <dt>Vite and Next.js only</dt>
                <dd>
                  No standalone webpack or Rspack integration yet, though the
                  Next loader is an ordinary webpack loader. This page loads the
                  client bundle directly, which is the other way in.
                </dd>
              </div>
              <div>
                <dt>Cross-origin rules are invisible</dt>
                <dd>
                  The panel warns when that applies rather than pretending it
                  saw everything. Token values are unaffected, because the
                  browser resolves those.
                </dd>
              </div>
              <div>
                <dt>Container queries are not evaluated</dt>
                <dd>
                  A rule inside one may be considered when it does not apply.
                  Findings that depend on one are flagged.
                </dd>
              </div>
              <div>
                <dt>Lengths and colours only</dt>
                <dd>
                  Shadows, gradients, transitions and font stacks are not
                  analysed.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <footer
        className="shell flex flex-wrap items-center justify-between gap-4 border-t py-8"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        <p
          className="mono text-[10px] tracking-[0.16em] uppercase"
          style={{ color: "var(--text-faint)" }}
        >
          MIT. Built by Steven McKinnon.
        </p>
        <p
          className="mono text-[10px] tracking-[0.16em] uppercase"
          style={{ color: "var(--text-faint)" }}
        >
          This page has two discovered axes.
        </p>
      </footer>
    </main>
  );
}
