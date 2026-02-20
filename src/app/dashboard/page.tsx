import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch user's projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload video clips, tag them with AI, and match them to your script.
          </p>
        </div>
        <button
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
          disabled
          title="Coming in next task"
        >
          New project
        </button>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">No projects yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Video upload and project creation coming in the next task.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: { id: string; name: string; description: string | null; created_at: string }) => (
            <div
              key={project.id}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow"
            >
              <h3 className="font-medium text-gray-900">{project.name}</h3>
              {project.description && (
                <p className="mt-1 text-sm text-gray-500">{project.description}</p>
              )}
              <p className="mt-3 text-xs text-gray-400">
                {new Date(project.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
