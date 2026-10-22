export const metadata = { title: "Privacy Policy" };

const UPDATED = "October 22, 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[820px] px-6 py-12">
      <div className="eyebrow">Legal</div>
      <h1 className="mt-1 text-[34px] font-extrabold tracking-[-1px] text-frost-deep">Privacy Policy</h1>
      <p className="mt-2 text-[13.5px] font-semibold text-plum-muted">Last updated {UPDATED}</p>

      <div className="mt-8 flex flex-col gap-7 text-[15px] leading-relaxed text-plum-body">
        <section className="flex flex-col gap-2">
          <p>cupcake.gg (“cupcake”, “we”, “us”) is a members-only watch box for the kuro community. This policy explains what we collect, why, and the choices you have. We keep it short because we keep the data small.</p>
        </section>

        <Section title="Who we are">
          <p>cupcake is a non-commercial, community project. Access is granted through your kuro account. We are not affiliated with the third-party services whose catalog metadata or streams we display.</p>
        </Section>

        <Section title="What we collect">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li><b>Account basics</b> from kuro when you sign in: your handle, display name, and avatar. We do not receive or store your kuro password.</li>
            <li><b>Your activity on cupcake</b>: your watch list and box, watch progress, ratings, comments, reactions, requests, and profile settings you choose to set.</li>
            <li><b>Presence</b>: which title and episode you are currently viewing, so members can see who’s watching together. This is transient.</li>
            <li><b>Basic technical data</b> needed to run the site: a session cookie, and standard request logs (IP address, user agent) kept briefly for security and abuse prevention.</li>
          </ul>
        </Section>

        <Section title="What we do not collect">
          <p>We don’t sell data, we don’t run third-party advertising or tracking pixels, and we don’t build advertising profiles. We don’t knowingly collect information from anyone under the age required by their local law to consent.</p>
        </Section>

        <Section title="How we use it">
          <p>To sign you in, remember where you left off, power your list and profile, show presence and social features, and keep the service working and safe. That’s it.</p>
        </Section>

        <Section title="Cookies">
          <p>We use a small number of first-party cookies strictly to keep you signed in and to remember preferences such as your chosen theme. We do not use advertising or cross-site tracking cookies. Some preferences are stored in your browser’s local storage and never leave your device.</p>
        </Section>

        <Section title="Where it lives">
          <p>Your data is stored in a Cloudflare D1 database and served from Cloudflare’s network. Anime artwork, metadata and streams are fetched from third-party sources; your requests to those services are subject to their own policies.</p>
        </Section>

        <Section title="Retention">
          <p>We keep your account data while your account is active. Request logs are kept only briefly. When your access ends, or on request, we delete the data we hold about you, except anything we must keep to resolve disputes or prevent abuse.</p>
        </Section>

        <Section title="Your choices">
          <p>You can edit or clear most of your information from your profile settings at any time, make your lists private, or ask us to delete your account data. Reach out through the community Discord linked in the footer.</p>
        </Section>

        <Section title="Changes">
          <p>We may update this policy as the site evolves. Material changes will be noted by updating the date above. Continuing to use cupcake after a change means you accept the updated policy.</p>
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
