export const metadata = { title: "Terms of Service" };

const UPDATED = "October 22, 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-[820px] px-6 py-12">
      <div className="eyebrow">Legal</div>
      <h1 className="mt-1 text-[34px] font-extrabold tracking-[-1px] text-frost-deep">Terms of Service</h1>
      <p className="mt-2 text-[13.5px] font-semibold text-plum-muted">Last updated {UPDATED}</p>

      <div className="mt-8 flex flex-col gap-7 text-[15px] leading-relaxed text-plum-body">
        <section className="flex flex-col gap-2">
          <p>These terms govern your use of cupcake.gg. By signing in and using the site, you agree to them. If you don’t agree, please don’t use cupcake.</p>
        </section>

        <Section title="Who can use cupcake">
          <p>cupcake is a members-only, non-commercial project for the kuro community. Access is tied to your kuro account and is personal to you. You’re responsible for activity under your account and for keeping your access secure.</p>
        </Section>

        <Section title="Acceptable use">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Be decent. No harassment, hate, threats, or spam in comments, requests, or profiles.</li>
            <li>Don’t attempt to break, overload, scrape, or circumvent the service, its access controls, or its rate limits.</li>
            <li>Don’t use cupcake for anything unlawful, or upload content you don’t have the right to share.</li>
            <li>Don’t resell, redistribute, or publicly rebroadcast access or content from cupcake.</li>
          </ul>
          <p>We may suspend or remove access that breaks these rules, at our discretion.</p>
        </Section>

        <Section title="Content &amp; metadata">
          <p>Anime artwork, titles, descriptions, and related metadata belong to their respective owners and are shown via third-party sources. Streams are resolved from third-party providers. cupcake does not claim ownership of this material and provides it for personal, non-commercial viewing within the community.</p>
        </Section>

        <Section title="Your content">
          <p>You keep ownership of comments, ratings, and other content you post. By posting, you grant cupcake a non-exclusive licence to display it within the service. You’re responsible for what you post, and we may remove content that breaks these terms.</p>
        </Section>

        <Section title="Availability">
          <p>cupcake is provided “as is” and “as available”, with no guarantee of uptime, accuracy, or that any particular title or episode will be present or playable. Features may change or be removed at any time.</p>
        </Section>

        <Section title="Disclaimer &amp; liability">
          <p>To the fullest extent permitted by law, cupcake and its maintainers are not liable for any indirect, incidental, or consequential damages arising from your use of the service. The service is run by volunteers for the community, without warranty of any kind.</p>
        </Section>

        <Section title="Termination">
          <p>You can stop using cupcake at any time. We may suspend or end your access if you break these terms or if the project winds down. Some provisions (ownership, disclaimers, liability) survive termination.</p>
        </Section>

        <Section title="Changes">
          <p>We may update these terms as the site evolves. Material changes will be noted by updating the date above. Continuing to use cupcake after a change means you accept the updated terms.</p>
        </Section>

        <Section title="Contact">
          <p>Questions? Reach the maintainers through the community Discord linked in the footer.</p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[20px] font-extrabold tracking-[-.4px] text-plum">{title}</h2>
      {children}
    </section>
  );
}
