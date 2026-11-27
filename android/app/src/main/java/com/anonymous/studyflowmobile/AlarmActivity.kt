package com.anonymous.studyflowmobile

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class AlarmActivity : Activity() {
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    val title = intent.getStringExtra("title") ?: "StudyFlow task"
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(40, 40, 40, 40)
      setBackgroundColor(0xfff2f7f6.toInt())
    }
    layout.addView(TextView(this).apply { text = "StudyFlow Alarm"; textSize = 26f; gravity = Gravity.CENTER })
    layout.addView(TextView(this).apply { text = title; textSize = 20f; gravity = Gravity.CENTER; setPadding(0, 30, 0, 30) })
    layout.addView(Button(this).apply { text = "Stop"; setOnClickListener { finish() } })
    layout.addView(Button(this).apply { text = "Snooze 5 minutes"; setOnClickListener { snooze(); finish() } })
    setContentView(layout)
    ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
    ringtone?.play()
    vibrator = getSystemService(Vibrator::class.java)
    vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 700, 350, 700), 0))
  }

  private fun snooze() {
    val id = intent.getStringExtra("alarmId") ?: return
    val alarmIntent = Intent(this, AlarmReceiver::class.java).apply {
      putExtra("alarmId", id)
      putExtra("title", intent.getStringExtra("title") ?: "StudyFlow task")
    }
    val pending = PendingIntent.getBroadcast(this, id.hashCode(), alarmIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val time = System.currentTimeMillis() + 5 * 60 * 1000
    getSystemService(AlarmManager::class.java).setAlarmClock(AlarmManager.AlarmClockInfo(time, pending), pending)
  }

  override fun onDestroy() {
    ringtone?.stop()
    vibrator?.cancel()
    super.onDestroy()
  }
}
