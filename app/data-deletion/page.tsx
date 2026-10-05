import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion - AutoReplies",
  description:
    "How to delete your data from AutoReplies, whether you commented on a connected Instagram post or use AutoReplies for your own account.",
};

const sectionTitle = "text-xl font-bold text-white";
const link = "text-accent underline underline-offset-4";

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Data Deletion"
      description="How to remove your data from AutoReplies, whether you commented on a connected Instagram post or you use AutoReplies to run replies for your own account."
      updatedAt="October 5, 2026"
    >
      <section>
        <h2 className={sectionTitle}>If You Commented On A Connected Post</h2>
        <p className="mt-3">
          Email{" "}
          <a
            href="mailto:hello@originalcopy.studio?subject=Delete%20my%20data"
            className={link}
          >
            hello@originalcopy.studio
          </a>{" "}
          with the subject &quot;Delete my data&quot; and your Instagram
          username. We will delete your comments, delivery records and link
          clicks from AutoReplies within 30 days and confirm by email.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Disconnect Your Instagram Account</h2>
        <p className="mt-3">
          Sign in, open Settings and select Disconnect. This deletes the stored
          Instagram connection and access token along with that account&apos;s
          campaigns, comment and delivery logs, tracked links and click
          records, and stops all replies straight away.
        </p>
        <p className="mt-3">
          You can also remove AutoReplies from Instagram itself, under Settings,
          Website permissions, Apps and websites.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Delete Your Whole Workspace</h2>
        <p className="mt-3">
          Email{" "}
          <a
            href="mailto:hello@originalcopy.studio?subject=Delete%20my%20workspace"
            className={link}
          >
            hello@originalcopy.studio
          </a>{" "}
          from the address you sign in with, including the workspace name and
          the connected Instagram username. We will delete the workspace, its
          team access, campaigns, logs, webhook records and diagnostics within
          30 days and confirm by email.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Verification</h2>
        <p className="mt-3">
          We may ask you to confirm that you control the email address or
          Instagram account before we delete anything. We only keep data longer
          where the law requires it.
        </p>
      </section>
    </LegalShell>
  );
}
