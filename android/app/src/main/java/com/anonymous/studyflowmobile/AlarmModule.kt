package com.anonymous.studyflowmobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "StudyFlowAlarm"

  @ReactMethod
  fun scheduleAlarm(id: String, timestamp: Double, title: String, promise: Promise) {
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      putExtra("alarmId", id)
      putExtra("title", title)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context, id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(timestamp.toLong(), pendingIntent), pendingIntent)
    promise.resolve("alarm:$id")
  }

  @ReactMethod
  fun cancelAlarm(id: String, promise: Promise) {
    val intent = Intent(context, AlarmReceiver::class.java)
    val pendingIntent = PendingIntent.getBroadcast(
      context, id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
    promise.resolve(null)
  }
}
