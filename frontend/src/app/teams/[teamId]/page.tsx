import { TeamWorkspace } from "@/features/teams/components/TeamWorkspace";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamWorkspace teamId={teamId} />;
}
