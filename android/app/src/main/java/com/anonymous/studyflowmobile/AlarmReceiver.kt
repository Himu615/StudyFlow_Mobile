package com.anonymous.studyflowmobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarm = Intent(context, AlarmActivity::class.java).apply {
      putExtra("alarmId", intent.getStringExtra("alarmId"))
      putExtra("title", intent.getStringExtra("title") ?: "StudyFlow task")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    context.startActivity(alarm)
  }
}
