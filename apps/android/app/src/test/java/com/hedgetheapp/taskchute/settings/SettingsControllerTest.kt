package com.hedgetheapp.taskchute.settings

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsControllerTest {
    @Test
    fun sectionDeleteUsesCanonicalAdjacentAbsorption() {
        val repository = FakeSettingsRepository().apply {
            section = AndroidSectionConfiguration("v1", 0, listOf(
                AndroidSectionSetting("morning", "朝", 0, 600),
                AndroidSectionSetting("evening", "夜", 600, 1440),
            ))
        }
        val controller = controller(repository)
        controller.openSections()
        assertTrue(await { controller.state.sectionConfiguration != null && !controller.state.loading })
        controller.requestDeleteSection("morning")
        controller.confirmDelete()

        assertTrue(await { repository.sectionUpdates.size == 1 })
        val request = repository.sectionUpdates.single()
        assertEquals(listOf(AndroidSectionSetting("evening", "夜", 0, 1440)), request.items)
        assertEquals("v1", request.expectedConfigurationVersionId)
        controller.close()
    }

    @Test
    fun sectionEditorAcceptsLogicalClockTextAcrossDayBoundary() {
        val repository = FakeSettingsRepository().apply {
            section = AndroidSectionConfiguration("v1", 300, listOf(
                AndroidSectionSetting("morning", "朝", 300, 540),
                AndroidSectionSetting("night", "夜", 540, 1740),
            ))
        }
        val controller = controller(repository)
        controller.openSections()
        assertTrue(await { controller.state.sectionConfiguration != null && !controller.state.loading })
        controller.openSection("night")
        controller.updateSectionDraft(title = "夜間")
        controller.saveSection()

        assertTrue(await { repository.sectionUpdates.size == 1 })
        val saved = repository.sectionUpdates.single().items
        assertEquals(300, saved.first().startMinute)
        assertEquals(1740, saved.last().endMinute)
        controller.close()
    }

    @Test
    fun ambiguousProjectOperationRetainsExactRequestForRetry() {
        val repository = FakeSettingsRepository().apply {
            projectBoard = AndroidProjectBoard(2, emptyList())
            createProjectResults.add(SettingsResult.Failure("ambiguous", ambiguous = true))
            createProjectResults.add(SettingsResult.Success(Unit))
        }
        val controller = controller(repository)
        controller.openProjects()
        assertTrue(await { controller.state.projectBoard != null && !controller.state.loading })
        controller.openNewProject()
        controller.updateProjectDraft("Life")
        controller.saveProject()
        assertTrue(await { controller.state.unresolvedOperation != null })
        val retained = controller.state.unresolvedOperation
        assertNotNull(retained)
        controller.retryUnresolved()
        assertTrue(await { repository.createdProjects.size == 2 && controller.state.unresolvedOperation == null })
        assertEquals(2, repository.createdProjects.size)
        assertEquals(repository.createdProjects[0], repository.createdProjects[1])
        controller.close()
    }

    @Test
    fun routineToggleCarriesExpectedRevisionAndReloads() {
        val routine = AndroidRoutineSetting("r1", "t1", "朝の準備", null, null, false, RoutineScheduleSpec(), null, null, null, null, "2026-09-16", null, 4)
        val repository = FakeSettingsRepository().apply { routineBoard = AndroidRoutineBoard(3, "2026-09-16", emptyList(), listOf(routine)) }
        val controller = controller(repository)
        controller.openRoutines()
        assertTrue(await { controller.state.routineBoard != null && !controller.state.loading })
        controller.toggleRoutine("r1", true)
        assertTrue(await { repository.enabledRequests.size == 1 })
        assertEquals(1, repository.enabledRequests.size)
        assertEquals(4, repository.enabledRequests.single().expectedSettingsRevision)
        assertTrue(repository.enabledRequests.single().enabled)
        controller.close()
    }

    private fun controller(repository: FakeSettingsRepository) = SettingsController(
        repository,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    )

    private fun await(condition: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + 2_000_000_000L
        while (System.nanoTime() < deadline) {
            if (condition()) return true
            Thread.yield()
        }
        return condition()
    }
}

private class FakeSettingsRepository : AndroidSettingsRepository {
    var section = AndroidSectionConfiguration("v1", 0, emptyList())
    var projectBoard = AndroidProjectBoard(1, emptyList())
    var routineBoard = AndroidRoutineBoard(1, "2026-09-16", emptyList(), emptyList())
    val sectionUpdates = mutableListOf<SectionConfigurationUpdateRequest>()
    val createdProjects = mutableListOf<CreateProjectSettingsRequest>()
    val createProjectResults = ArrayDeque<SettingsResult<Unit>>()
    val enabledRequests = mutableListOf<SetRoutineEnabledSettingsRequest>()
    private val loads = AtomicInteger(0)

    override fun loadSectionConfiguration() = SettingsResult.Success(section)
    override fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest): SettingsResult<Unit> { sectionUpdates += request; section = section.copy(configurationVersionId = request.configurationVersionId, sections = request.items); return SettingsResult.Success(Unit) }
    override fun loadProjectBoard() = SettingsResult.Success(projectBoard)
    override fun createProject(request: CreateProjectSettingsRequest): SettingsResult<Unit> { createdProjects += request; return createProjectResults.removeFirstOrNull() ?: SettingsResult.Success(Unit) }
    override fun updateProject(request: UpdateProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun setProjectArchived(request: SetProjectArchivedSettingsRequest) = SettingsResult.Success(Unit)
    override fun reorderProjects(request: ReorderProjectsSettingsRequest) = SettingsResult.Success(Unit)
    override fun deleteProject(request: DeleteProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun loadRoutineBoard() = SettingsResult.Success(routineBoard)
    override fun createRoutine(request: CreateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun updateRoutine(request: UpdateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest): SettingsResult<Unit> { enabledRequests += request; return SettingsResult.Success(Unit) }
    override fun deleteRoutine(request: DeleteRoutineSettingsRequest) = SettingsResult.Success(Unit)
}
