import { MeetingWorkspace } from "@/features/meetings/components/MeetingWorkspace";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <MeetingWorkspace teamId={teamId} />;
}
