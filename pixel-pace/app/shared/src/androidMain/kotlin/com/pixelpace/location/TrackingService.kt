package com.pixelpace.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Foreground service (type "location") that keeps recording the run when the app is in the
 * background or the screen is off. It owns the GPS while a run is active and feeds [RunHolder].
 * Stops itself when the run is finished or reset.
 */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var provider: AndroidLocationProvider? = null
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }

        ensureChannel()
        val first = notification(RunHolder.session.state.value)
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, first, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIFICATION_ID, first)

        if (provider == null) {
            val p = AndroidLocationProvider(applicationContext)
            provider = p
            p.start { RunHolder.session.onFix(it) }

            job = scope.launch {
                launch { // adaptive GPS rate
                    RunHolder.session.state.map { it.moving }.distinctUntilChanged().collect {
                        p.setUpdateIntervalMs(if (it) 1_000L else 5_000L)
                    }
                }
                var lastText = ""
                RunHolder.session.state.collect { s ->
                    if (!s.active) { stopSelf(); return@collect }
                    val n = notification(s)
                    val text = n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
                    if (text != lastText) { // refresh only when the text changes
                        lastText = text
                        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, n)
                    }
                }
            }
        }
        // if the process is killed the in-memory run is gone anyway (persistence arrives with M5)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        provider?.stop(); provider = null
        scope.cancel()
        super.onDestroy()
    }

    private fun ensureChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Run tracking", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "Shown while Pixel Pace records a run" },
            )
        }
    }

    private fun notification(s: RunState): Notification {
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val paused = if (s.status == RunStatus.Paused) "  ·  PAUSED" else ""
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Pixel Pace — run in progress")
            .setContentText("${RunFormat.km(s.distanceM)} km  ·  ${RunFormat.time(s.elapsedMs)}$paused")
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "run_tracking"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.pixelpace.action.STOP_TRACKING"

        fun start(context: Context) {
            context.startForegroundService(Intent(context, TrackingService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}
