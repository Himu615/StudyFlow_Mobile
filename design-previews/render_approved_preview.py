from PIL import Image, ImageDraw, ImageFont
W,H=1600,1050
img=Image.new("RGB",(W,H),"#e6f5f7"); d=ImageDraw.Draw(img)
def font(n,b=False): return ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf" if b else "C:/Windows/Fonts/arial.ttf",n)
title=font(28,True); h=font(16,True); b=font(11); s=font(9); tiny=font(8)
d.text((38,28),"StudyFlow Mobile · approved reference-style preview",fill="#123d46",font=title)
d.text((38,62),"Feature mapping only — implementation starts after your approval.",fill="#66818a",font=b)
Wphone,Hphone=248,405
def phone(x,y,label,theme="#fff"):
    d.rounded_rectangle((x,y,x+Wphone,y+Hphone),radius=25,fill=theme,outline="#c8e0e3",width=2)
    d.text((x+15,y+15),label,fill="#087b82" if theme=="#fff" else "#b8ece2",font=s)
    d.text((x+Wphone-44,y+14),"9:41",fill="#8aa0a5",font=tiny)
def nav(x,y,active):
    d.line((x+16,y+370,x+Wphone-16,y+370),fill="#dbe9e9",width=1)
    for i,t in enumerate(["Home","Plan","Focus","Stats","More"]):
        xx=x+24+i*48; d.text((xx,y+378),t,fill="#087b82" if t==active else "#8aa0a5",font=tiny)
def card(x,y,w,h,fill="#f5fbfb"): d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill=fill)
xs=[38,350,662,974,1286]; top=105; bot=580
# Splash
phone(xs[0],top,"STUDYFLOW")
d.ellipse((xs[0]+70,top+65,xs[0]+178,top+173),fill="#c8f1ea"); d.polygon([(xs[0]+92,top+140),(xs[0]+124,top+103),(xs[0]+156,top+140),(xs[0]+124,top+154)],fill="#087b82")
d.text((xs[0]+55,top+205),"StudyFlow",fill="#123d46",font=font(24,True)); d.text((xs[0]+58,top+238),"Plan. Focus. Finish.",fill="#66818a",font=b)
d.rounded_rectangle((xs[0]+30,top+305,xs[0]+218,top+347),radius=21,fill="#10a889"); d.text((xs[0]+82,top+318),"Get started →",fill="white",font=b)
d.text((xs[0]+92,top+445),"01 · Splash",fill="#123d46",font=b)
# login
phone(xs[1],top,"WELCOME BACK")
d.text((xs[1]+20,top+63),"StudyFlow",fill="#123d46",font=h); d.text((xs[1]+20,top+88),"Welcome back",fill="#66818a",font=s)
for yy,t in [(top+125,"Email or student ID"),(top+177,"Password")]:
    card(xs[1]+20,yy,208,40); d.text((xs[1]+32,yy+14),t,fill="#78939a",font=s)
d.rounded_rectangle((xs[1]+20,top+236,xs[1]+228,top+277),radius=20,fill="#11a889"); d.text((xs[1]+96,top+249),"Sign in",fill="white",font=b)
d.text((xs[1]+62,top+315),"New here? Sign up",fill="#087b82",font=s); nav(xs[1],top,""); d.text((xs[1]+84,top+445),"02 · Login",fill="#123d46",font=b)
# home
phone(xs[2],top,"HOME"); d.text((xs[2]+18,top+60),"Hello, Ahmed 👋",fill="#123d46",font=h); card(xs[2]+18,top+88,212,75,"#10a889"); d.text((xs[2]+32,top+108),"Your learning health",fill="#d9fff7",font=s); d.text((xs[2]+32,top+130),"Excellent",fill="white",font=h); d.text((xs[2]+167,top+129),"82%",fill="white",font=h)
d.text((xs[2]+18,top+190),"Quick actions",fill="#123d46",font=b)
for i,t in enumerate(["Task","Focus","Planner","Stats"]):
    xx=xs[2]+18+i*51; card(xx,top+208,45,52,"#eaf7f6"); d.text((xx+10,top+222),["＋","◷","▤","▥"][i],fill="#087b82",font=h); d.text((xx+8,top+245),t,fill="#123d46",font=tiny)
d.text((xs[2]+18,top+286),"Today’s plan",fill="#123d46",font=b); card(xs[2]+18,top+301,212,45); d.text((xs[2]+30,top+316),"SQL practice · 45 min",fill="#123d46",font=s); nav(xs[2],top,"Home"); d.text((xs[2]+84,top+445),"03 · Home",fill="#123d46",font=b)
# planner
phone(xs[3],top,"PLANNER"); d.text((xs[3]+18,top+60),"Personalized Study Plan",fill="#123d46",font=h); card(xs[3]+18,top+82,212,38,"#e4f7f3"); d.text((xs[3]+35,top+95),"Today     This week     Month",fill="#087b82",font=tiny); d.text((xs[3]+18,top+148),"Thu, 27 Nov",fill="#123d46",font=b)
for i,(task,meta) in enumerate([("Database normalization","45 min · completed"),("SQL practice quiz","15 min · reminder 10:00"),("Read ER diagrams","30 min")]):
    yy=top+172+i*50; d.ellipse((xs[3]+22,yy+3,xs[3]+34,yy+15),fill="#11a889" if i==0 else "#fff",outline="#11a889"); d.text((xs[3]+45,yy),task,fill="#123d46",font=s); d.text((xs[3]+45,yy+16),meta,fill="#66818a",font=tiny)
d.rounded_rectangle((xs[3]+18,top+330,xs[3]+230,top+370),radius=20,fill="#11a889"); d.text((xs[3]+77,top+343),"Add planned task",fill="white",font=s); nav(xs[3],top,"Plan"); d.text((xs[3]+80,top+445),"04 · Planner",fill="#123d46",font=b)
# focus
phone(xs[4],top,"FOCUS", "#103c43"); d.text((xs[4]+18,top+60),"Focus session",fill="#fff",font=h); d.text((xs[4]+18,top+85),"SQL practice quiz",fill="#b8ece2",font=s); d.ellipse((xs[4]+54,top+135,xs[4]+194,top+275),outline="#285762",width=9); d.arc((xs[4]+54,top+135,xs[4]+194,top+275),-70,70,fill="#47d1ad",width=9); d.text((xs[4]+88,top+191),"15:00",fill="white",font=font(28,True)); d.text((xs[4]+103,top+225),"estimated",fill="#b8ece2",font=tiny); d.rounded_rectangle((xs[4]+18,top+302,xs[4]+230,top+343),radius=20,fill="#47d1ad"); d.text((xs[4]+87,top+315),"Start focus",fill="#103c43",font=b); nav(xs[4],top,"Focus"); d.text((xs[4]+84,top+445),"05 · Focus",fill="#123d46",font=b)
# task/reminder
phone(xs[0],bot,"NEW TASK"); d.text((xs[0]+18,bot+60),"Add task",fill="#123d46",font=h); card(xs[0]+18,bot+87,212,38); d.text((xs[0]+32,bot+100),"Task title",fill="#78939a",font=s); card(xs[0]+18,bot+140,212,38); d.text((xs[0]+32,bot+153),"Estimated minutes: 45",fill="#123d46",font=s); card(xs[0]+18,bot+193,212,38,"#e4f7f3"); d.text((xs[0]+32,bot+206),"Calendar: Thu 27 Nov",fill="#087b82",font=s); card(xs[0]+18,bot+246,212,38,"#fff2dc"); d.text((xs[0]+32,bot+259),"Reminder: 15 min before",fill="#d88d2c",font=s); d.rounded_rectangle((xs[0]+18,bot+305,xs[0]+230,bot+346),radius=20,fill="#11a889"); d.text((xs[0]+91,bot+318),"Save task",fill="white",font=b); d.text((xs[0]+77,bot+445),"06 · Task form",fill="#123d46",font=b)
# insights
phone(xs[1],bot,"INSIGHTS"); d.text((xs[1]+18,bot+60),"Learning Analytics",fill="#123d46",font=h); card(xs[1]+18,bot+82,92,55,"#e4f7f3"); d.text((xs[1]+30,bot+95),"Focus time",fill="#66818a",font=tiny); d.text((xs[1]+30,bot+113),"4h 20m",fill="#087b82",font=b); card(xs[1]+118,bot+82,112,55,"#fff2dc"); d.text((xs[1]+130,bot+95),"Tasks done",fill="#66818a",font=tiny); d.text((xs[1]+130,bot+113),"18",fill="#d88d2c",font=b); d.text((xs[1]+18,bot+168),"Weekly activity",fill="#123d46",font=b); pts=[(xs[1]+25,bot+290),(xs[1]+52,bot+265),(xs[1]+78,bot+278),(xs[1]+105,bot+225),(xs[1]+132,bot+245),(xs[1]+160,bot+195),(xs[1]+196,bot+215)]; d.line(pts,fill="#11a889",width=4); d.line((xs[1]+22,bot+300,xs[1]+203,bot+300),fill="#d7e9e8",width=2); d.text((xs[1]+18,bot+330),"Tasks added / completed",fill="#66818a",font=tiny); nav(xs[1],bot,"Stats"); d.text((xs[1]+76,bot+445),"07 · Insights",fill="#123d46",font=b)
# notes
phone(xs[2],bot,"NOTEPAD"); d.text((xs[2]+18,bot+60),"Notepad",fill="#123d46",font=h); card(xs[2]+18,bot+83,212,36); d.text((xs[2]+31,bot+96),"Search notes",fill="#78939a",font=s); card(xs[2]+18,bot+137,212,67,"#fff2dc"); d.text((xs[2]+31,bot+157),"Exam ideas",fill="#123d46",font=b); d.text((xs[2]+31,bot+179),"Offline saved note",fill="#66818a",font=tiny); card(xs[2]+18,bot+220,212,67,"#e4f7f3"); d.text((xs[2]+31,bot+240),"Project thoughts",fill="#123d46",font=b); d.text((xs[2]+31,bot+262),"Keep ideas on device",fill="#66818a",font=tiny); d.rounded_rectangle((xs[2]+18,bot+306,xs[2]+230,bot+347),radius=20,fill="#11a889"); d.text((xs[2]+88,bot+319),"+ New note",fill="white",font=b); nav(xs[2],bot,"More"); d.text((xs[2]+84,bot+445),"08 · Notes",fill="#123d46",font=b)
# offline
phone(xs[3],bot,"OFFLINE READY"); d.ellipse((xs[3]+77,bot+75,xs[3]+171,bot+169),fill="#dff7ed"); d.line((xs[3]+101,bot+120,xs[3]+119,bot+138),fill="#11a889",width=7); d.line((xs[3]+119,bot+138,xs[3]+151,bot+103),fill="#11a889",width=7); d.text((xs[3]+42,bot+205),"Still ready to study",fill="#123d46",font=h); d.text((xs[3]+45,bot+232),"2 task changes waiting to sync",fill="#66818a",font=s); card(xs[3]+18,bot+265,212,42); d.text((xs[3]+33,bot+279),"Local notes available",fill="#087b82",font=s); d.rounded_rectangle((xs[3]+18,bot+322,xs[3]+230,bot+362),radius=20,fill="#11a889"); d.text((xs[3]+77,bot+335),"Sync when online",fill="white",font=s); d.text((xs[3]+76,bot+445),"09 · Offline",fill="#123d46",font=b)
# settings
phone(xs[4],bot,"SETTINGS"); d.text((xs[4]+18,bot+60),"Settings",fill="#123d46",font=h); d.ellipse((xs[4]+86,bot+79,xs[4]+143,bot+136),fill="#dff2e9"); d.text((xs[4]+101,bot+97),"AR",fill="#087b82",font=b); d.text((xs[4]+78,bot+160),"Ahmed Rahman",fill="#123d46",font=b)
for i,t in enumerate(["Profile & email","Notifications · Enabled","Offline data","About StudyFlow"]):
    yy=bot+188+i*35; card(xs[4]+18,yy,212,28); d.text((xs[4]+31,yy+9),t,fill="#123d46",font=tiny)
d.text((xs[4]+18,bot+345),"Log out",fill="#b42318",font=s); nav(xs[4],bot,"More"); d.text((xs[4]+76,bot+445),"10 · Settings",fill="#123d46",font=b)
img.save("C:/Project_for_3-2/studyflow-mobile/design-previews/studyflow-approved-reference-preview.png")

