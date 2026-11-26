from PIL import Image, ImageDraw, ImageFont
W,H=1500,900
img=Image.new("RGB",(W,H),"#e5f6f5")
d=ImageDraw.Draw(img)
font_path="C:/Windows/Fonts/arial.ttf"
def ft(n,b=False): return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf" if b else font_path,n)
title=ft(30,True); head=ft(20,True); small=ft(12); tiny=ft(10)
d.text((50,35),"StudyFlow Mobile · Reference-style UI",fill="#123d46",font=title)
d.text((50,70),"Aqua background, green cards, rounded screens and clear student workflows",fill="#66818a",font=small)
def phone(x,y,label,dark=False):
    bg="#103c43" if dark else "#ffffff"
    d.rounded_rectangle((x,y,x+205,y+350),radius=27,fill=bg,outline="#c5e2e3",width=2)
    d.text((x+21,y+22),label,fill="#a7e5d8" if dark else "#087b82",font=small)
def caption(x,y,t): d.text((x,y),t,fill="#123d46",font=small)
phone(45,120,"STUDYFLOW"); d.ellipse((92,170,198,276),fill="#c9f3ec"); d.polygon([(118,235),(145,202),(172,235),(145,247)],fill="#087b82"); d.text((91,290),"StudyFlow",fill="#123d46",font=head); d.text((88,320),"Plan. Focus. Finish.",fill="#66818a",font=small); d.rounded_rectangle((78,390,217,432),radius=20,fill="#10a889"); d.text((113,402),"Get started →",fill="white",font=small); caption(64,490,"Splash")
phone(270,120,"WELCOME BACK"); d.text((294,172),"Study smarter",fill="#123d46",font=head)
for yy,txt in [(215,"Email or student ID"),(266,"Password")]:
    d.rounded_rectangle((293,yy,452,yy+40),radius=10,fill="#f1f8f8",outline="#cde4e5"); d.text((307,yy+13),txt,fill="#78939a",font=small)
d.rounded_rectangle((293,324,452,364),radius=20,fill="#11a889"); d.text((354,337),"Log in",fill="white",font=small); d.text((311,410),"New here? Sign up",fill="#087b82",font=small); caption(291,490,"Login")
phone(495,120,"STUDYFLOW"); d.text((516,167),"Hello, Ahmed 👋",fill="#123d46",font=head); d.rounded_rectangle((516,185,679,255),radius=14,fill="#10a889"); d.text((530,207),"Your learning health",fill="#d9fff7",font=small); d.text((530,226),"Excellent     82%",fill="white",font=ft(17,True)); d.text((516,286),"Quick actions",fill="#123d46",font=small)
for xx,txt in [(516,"Task"),(573,"Focus"),(630,"Plan")]:
    d.rounded_rectangle((xx,300,xx+48,348),radius=12,fill="#e4f6f3"); d.text((xx+13,318),txt,fill="#087b82",font=tiny)
d.text((516,380),"Today’s tasks",fill="#123d46",font=small); d.rounded_rectangle((516,392,679,428),radius=9,fill="#fff",outline="#d7e9e8"); d.text((530,405),"SQL practice · 45 min",fill="#123d46",font=tiny); caption(516,490,"Home")
phone(720,120,"PLANNER"); d.text((741,166),"My planner",fill="#123d46",font=head); d.rounded_rectangle((741,185,904,224),radius=11,fill="#e5f7f3"); d.text((756,198),"Today    This week    Month",fill="#087b82",font=tiny); d.text((741,252),"Thu, 27 Nov",fill="#123d46",font=small)
for yy,task,meta in [(280,"Database normalization","45 min · completed"),(335,"SQL practice quiz","15 min · reminder 10:00"),(390,"Read ER diagrams","30 min")]:
    d.ellipse((746,yy+2,758,yy+14),fill="#11a889" if yy==280 else "#fff",outline="#11a889"); d.text((770,yy),task,fill="#123d46",font=tiny); d.text((770,yy+17),meta,fill="#66818a",font=tiny)
d.rounded_rectangle((741,452,904,490),radius=19,fill="#11a889"); d.text((794,464),"View full plan →",fill="white",font=tiny); caption(741,535,"Planner")
phone(945,120,"FOCUS MODE",True); d.text((966,169),"SQL practice quiz",fill="white",font=head); d.ellipse((974,220,1121,367),outline="#285762",width=9); d.arc((974,220,1121,367),-70,70,fill="#47d1ad",width=9); d.text((1004,274),"15:00",fill="white",font=ft(28,True)); d.text((1019,310),"estimated",fill="#a7e5d8",font=tiny); d.rounded_rectangle((966,394,1129,434),radius=20,fill="#47d1ad"); d.text((1023,407),"Start focus",fill="#103c43",font=small); caption(966,490,"Focus")
phone(1170,120,"INSIGHTS"); d.text((1191,166),"Insights",fill="#123d46",font=head)
for xx,label,value,color in [(1191,"Focus time","4h 20m","#e4f7f2"),(1278,"Streak","7 days","#fff2dc")]:
    d.rounded_rectangle((xx,185,xx+76,239),radius=11,fill=color); d.text((xx+10,197),label,fill="#66818a",font=tiny); d.text((xx+10,216),value,fill="#087b82",font=small)
d.text((1191,270),"Weekly progress",fill="#123d46",font=small); pts=[(1198,390),(1222,365),(1246,375),(1270,335),(1294,350),(1318,310),(1345,325)]; d.line(pts,fill="#11a889",width=4); d.line((1197,400,1350,400),fill="#d7e9e8",width=2); d.text((1191,430),"Tasks completed",fill="#66818a",font=tiny); d.rounded_rectangle((1191,447,1295,455),radius=4,fill="#9edcca"); d.rounded_rectangle((1191,463,1266,471),radius=4,fill="#11a889"); caption(1191,535,"Insights")
phone(270,570,"NOTEPAD"); d.text((291,616),"Notepad",fill="#123d46",font=head); d.rounded_rectangle((291,636,454,670),radius=10,fill="#f1f8f8"); d.text((305,648),"Search notes",fill="#78939a",font=small); d.rounded_rectangle((291,688,454,747),radius=11,fill="#fff3da"); d.text((305,707),"Exam ideas",fill="#123d46",font=small); d.text((305,727),"Offline saved note",fill="#66818a",font=tiny); d.rounded_rectangle((291,768,454,806),radius=19,fill="#11a889"); d.text((345,780),"+ New note",fill="white",font=small); caption(291,840,"Notes")
phone(495,570,"OFFLINE MODE"); d.ellipse((570,650,632,712),fill="#dff7ed"); d.line((587,681,600,694),fill="#11a889",width=6); d.line((600,694,625,667),fill="#11a889",width=6); d.text((540,742),"Still ready to study",fill="#123d46",font=head); d.text((534,770),"2 changes waiting to sync",fill="#66818a",font=small); d.rounded_rectangle((516,808,679,846),radius=19,fill="#11a889"); d.text((570,820),"Sync when online",fill="white",font=small); caption(516,840,"Offline sync")
phone(720,570,"SETTINGS"); d.text((741,616),"Settings",fill="#123d46",font=head); d.ellipse((810,637,860,687),fill="#dff2e9"); d.text((823,653),"AR",fill="#087b82",font=small); d.text((785,711),"Ahmed Rahman",fill="#123d46",font=small)
for yy,txt in [(735,"Profile & email"),(777,"Notifications · Enabled"),(819,"Offline data")]:
    d.rounded_rectangle((741,yy,904,yy+30),radius=9,fill="#f7fbfb"); d.text((754,yy+10),txt,fill="#123d46",font=tiny)
caption(741,840,"Settings")
phone(945,570,"DUE TIME"); d.text((966,616),"Choose due time",fill="#123d46",font=head); d.text((966,654),"Thu · 27 November",fill="#087b82",font=small); d.rounded_rectangle((966,668,1129,710),radius=10,fill="#e5f7f3"); d.text((981,682),"Calendar selected",fill="#087b82",font=small); d.rounded_rectangle((966,728,1041,760),radius=9,fill="#11a889"); d.text((987,738),"10:00",fill="white",font=small); d.rounded_rectangle((1049,728,1129,760),radius=9,fill="#f1f8f8"); d.text((1068,738),"10:30",fill="#66818a",font=small); d.text((966,792),"Reminder: 15 min before",fill="#d88d2c",font=small); d.rounded_rectangle((966,812,1129,850),radius=19,fill="#11a889"); d.text((1020,824),"Set time",fill="white",font=small); caption(966,840,"Calendar + reminder")
img.save("C:/Project_for_3-2/studyflow-mobile/design-previews/studyflow-reference-style.png")

