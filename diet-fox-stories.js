(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DietFoxStories = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const localized = (zh, ja, en) => ({ zh, ja, en });
  const scene = (id, titles, beats) => ({
    id, title: localized(...titles),
    lines: beats.map(([speaker, zh, ja, en]) => ({ speaker, text: localized(zh, ja, en) }))
  });
  // Like the ledger vignettes, the fox communicates through gestures.
  // Real-life actions are confirmed manually, independently of meal/body records.
  const stories = [
    scene('lunch-photo', ['午餐的额外配菜', 'お弁当にもう一品', 'An Extra Side Dish'], [
      ['', '你把便当摆到窗边，想给今天的午饭留张照片。镜头里除了饭盒，忽然多出一截金色的尾巴。', '窓辺にお弁当を置き、今日の昼食を写真に残そうとする。レンズを向けると、弁当箱の横に金色のしっぽが写り込んだ。', 'You set your lunchbox by the window to photograph today’s lunch. A golden tail suddenly appears beside it in the frame.'],
      ['you', '菜单上没有这一项。', 'お品書きにそんな一品はないよ。', 'That wasn’t on the menu.'],
      ['', '狐狐闻声转过头，把两只耳朵也挤进了画面。', '声を聞いたきつねが振り向き、今度は両耳まで画面に入り込んでくる。', 'The fox turns at the sound of your voice, getting both ears into the picture as well.'],
      ['', '你把相机往左挪。狐狐也往左挪，非要留下一张到场证明似的。', 'カメラを左へずらすと、きつねも左へ。どうしても自分がそこにいた証拠を残したいらしい。', 'You move the camera to the left. The fox moves left too, apparently determined to leave proof that he was there.'],
      ['you', '好，先拍合影。不过记录里的菜名，可不能写狐狐。', 'はいはい、まずは記念写真ね。でも料理名にきつねは書かないから。', 'All right, a picture together first. But I’m not listing a fox as one of the dishes.'],
      ['', '合影拍完，你终于从斜上方拍到了便当。狐狐心满意足地回到窗边，继续晒太阳。', '記念写真を撮り終えると、ようやく斜め上からお弁当だけの一枚が撮れた。満足したきつねは窓辺に戻り、また日なたぼっこを始めた。', 'After the portrait, you finally get a picture of the lunchbox from above. Satisfied, the fox returns to his sunny spot by the window.']
    ]),
    scene('table-seat', ['占座的客人', '予約席のお客さま', 'A Reserved Seat'], [
      ['', '你刚把晚饭端上桌，身后便传来几声轻轻的爪响。狐狐绕过桌脚，在另一张餐垫前坐了下来。', '夕食をテーブルに運ぶと、背後から小さな足音がする。きつねがテーブルの脚を回り込み、もう一枚のランチョンマットの前に座った。', 'You have just brought dinner to the table when you hear soft paws behind you. The fox circles a table leg and sits in front of the other placemat.'],
      ['you', '原来今天还有预约。', '今日は予約のお客さまがいたんだね。', 'Oh, we have a reservation today.'],
      ['', '狐狐低头看了看空空的餐垫，又抬起那双绿眼睛看你。', 'きつねは空っぽのマットに目を落とし、緑の瞳を上げてあなたを見る。', 'The fox looks down at the empty mat, then lifts his green eyes to you.'],
      ['you', '客人来得倒比服务生还准时。', 'お客さまのほうが店員より時間に正確だね。', 'The guest is even more punctual than the waiter.'],
      ['', '你把狐狐的小碗放到他的位置上，自己也在桌边坐下。狐狐收拢尾巴，低头享用自己的晚饭。', 'きつね用の小さな器を彼の席に置き、あなたもテーブルにつく。きつねはしっぽを体の脇に巻き、ようやく自分の夕食に取りかかった。', 'You put his little bowl in its place and sit down yourself. The fox tucks in his tail and gets on with his own dinner.'],
      ['you', '这桌齐了，开饭吧。', 'はい、全員そろったね。いただきます。', 'Everyone’s here. Let’s eat.']
    ]),
    scene('menu-adviser', ['翻页的顾问', 'メニュー選びの相談役', 'The Menu Adviser'], [
      ['', '你把两张餐厅菜单摊在桌上，还没决定去哪一家。狐狐伸出一只爪子，把其中一张往你面前拨了拨。', '二軒のお店のメニューをテーブルに広げ、どちらへ行くか迷っていると、きつねが前足で片方をあなたのほうへ押しやった。', 'You spread out two restaurant menus, still deciding where to go. The fox extends a paw and nudges one of them toward you.'],
      ['you', '你看懂了？', '読めたの？', 'You can read that?'],
      ['', '狐狐伸了个懒腰，顺势把下巴搁在菜单边上，摆出一副颇有见解的样子。', 'きつねは伸びをして、そのままメニューの端にあごを乗せる。いかにも何か考えがありそうな顔だ。', 'The fox stretches and rests his chin on the edge of the menu, looking as though he has a very considered opinion.'],
      ['', '你抽出菜单一看，上面恰好有道前两天还念叨着想吃的菜。', 'メニューをそっと引き出してみると、ちょうど数日前に食べたいと言っていた料理が載っていた。', 'You slide the menu out and find the very dish you were talking about a couple of days ago.'],
      ['you', '行，今天采纳顾问的意见。', 'では、今日は相談役のご意見を採用します。', 'Very well. I’ll take my adviser’s recommendation today.'],
      ['', '你把那张菜单叠好。狐狐在已经没什么用的另一张纸上打了个滚，又舒舒服服地躺下。', '選んだメニューを折りたたむと、きつねはもう用の済んだもう一枚の上でごろんと転がり、気持ちよさそうに寝そべった。', 'You fold up the chosen menu. The fox rolls over on the now-redundant sheet and settles in for a comfortable lie-down.']
    ]),
    scene('fridge-detective', ['冰箱失物招领处', '冷蔵庫の忘れ物係', 'The Fridge Lost and Found'], [
      ['', '你想找昨天放回冰箱的小盒酱汁，门边的几只瓶子已经挪了一遍。狐狐蹲在你脚边，始终盯着最下层。', '昨日冷蔵庫に戻したソースの小さな容器を探して、扉側の瓶をひと通り動かした。足元のきつねは、さっきから一番下の棚をじっと見ている。', 'You are looking for the little container of sauce you put back yesterday. You have moved every bottle in the door. The fox sits at your feet, staring at the bottom shelf.'],
      ['you', '下面也有线索？', '下にも手がかりがあるの？', 'A clue down there, too?'],
      ['', '你从冷藏室最里面取出一只小盒子。盖上贴着昨天的标签，正是你在找的那份。', '冷蔵室の奥から小さな容器を取り出す。ふたには昨日貼ったラベル。探していたソースだ。', 'You reach to the back of the fridge and pull out a little container. Yesterday’s label is on the lid: exactly what you were looking for.'],
      ['', '狐狐凑近看了看你手里的盒子，尾巴在地板上轻轻扫了一下。', 'きつねは手の中の容器をのぞき込み、しっぽで床をそっとひとなでした。', 'The fox peers at the container in your hand and sweeps his tail lightly across the floor.'],
      ['you', '看来得聘你当冰箱管理员了。', '冷蔵庫の管理人に雇わないとね。', 'I think I’ll have to hire you as the fridge manager.'],
      ['', '你顺手把几只食盒重新摆到好找的位置。狐狐看着你关上门，才慢悠悠地离开了这间仓库。', 'ついでにいくつかの保存容器を取り出しやすい位置に並べ直す。きつねは扉が閉まるのを見届けてから、のんびりとその倉庫を後にした。', 'You rearrange a few containers where you can find them more easily. The fox waits for you to close the door before sauntering away from his storeroom.']
    ]),
    scene('tea-coaster', ['杯垫临时征用', 'コースターの臨時徴用', 'Coaster Requisition'], [
      ['', '水壶刚响过，你端着茶杯回到桌边，才发现原本放在那儿的杯垫不见了。', '湯が沸き、紅茶を入れてテーブルに戻ると、いつもそこに置いてあったコースターが見当たらない。', 'The kettle has just boiled. You return to the table with your tea, only to discover that your coaster has disappeared.'],
      ['you', '狐狐，见过我的杯垫没有？', 'ねえ、コースター見なかった？', 'Fox, have you seen my coaster?'],
      ['', '狐狐安安静静地伏在旁边。一只金色爪子恰好比另一只垫得高了一点。', 'きつねは傍らでおとなしく伏せている。金色の前足の片方だけが、ほんの少し高いところにある。', 'The fox lies quietly beside you. One golden paw just happens to be sitting slightly higher than the other.'],
      ['', '你轻轻抬起那只爪子，熟悉的杯垫图案果然露了出来。狐狐把爪子重新放了回去。', 'その前足をそっと持ち上げると、見覚えのあるコースターの柄が現れた。きつねはまた足を同じ場所に戻した。', 'You gently lift the paw to reveal the familiar coaster pattern. The fox sets his paw right back down on it.'],
      ['you', '原来是给自己加了一块地毯。', 'なんだ、自分専用のじゅうたんにしてたのか。', 'Ah. You’ve acquired a little carpet for yourself.'],
      ['', '你取来备用杯垫，将原先那块留给狐狐。他眯起眼，蓬松的尾巴悄悄绕了过来。', '予備のコースターを持ってきて、元の一枚はきつねに譲る。彼は目を細め、ふわふわのしっぽをそっとあなたのほうへ伸ばした。', 'You fetch the spare coaster and leave the original with the fox. He narrows his eyes and quietly curls his fluffy tail toward you.']
    ]),
    scene('dinner-note', ['记录里的另一位', '記録に残ったもう一人', 'A Guest in the Record'], [
      ['', '晚饭后，你翻开本子记录今天吃过的东西。刚刚落笔，狐狐就把脑袋凑到了你的手腕边。', '夕食のあと、今日食べたものを記録しようとノートを開く。書き始めたところへ、きつねがあなたの手首に頭を寄せてきた。', 'After dinner, you open your notebook to record what you ate today. You have barely begun when the fox puts his head beside your wrist.'],
      ['you', '等等，最后一行还没写完。', 'ちょっと待って、最後の一行がまだなんだ。', 'Wait, I haven’t finished the last line yet.'],
      ['', '狐狐的鼻尖贴着本子的空白处，半天也没挪开，好像对这一页有点意见。', 'きつねはノートの余白に鼻先を寄せたまま動かない。このページに何か言いたげだ。', 'The fox keeps his nose against a blank part of the notebook, as though he has a comment on the page.'],
      ['you', '食材栏里不能写你，备注倒是可以。', '食材の欄には書けないけど、メモならいいか。', 'I can’t put you in the ingredients list, but I could put you in the notes.'],
      ['', '你在旁边添了一句“和狐狐一起吃了晚饭”。狐狐动了动耳朵，终于把位置让给了你的笔。', '余白に「きつねと一緒に夕食」と書き添えた。きつねは耳をぴくりと動かし、ようやくペンの通り道を空けてくれた。', 'You add a note: “Had dinner with the fox.” His ears twitch, and he finally makes room for your pen.'],
      ['you', '好了，今天出场的两位都登记了。', 'これで今日の登場人物は二人とも記録済み。', 'There. Both of today’s guests are accounted for.']
    ])
  ];

  const conditions = {
    'lunch-photo': [0, localized('给一顿日常餐食拍照，将照片留在自己的饮食记录中。', '普段の食事を一度撮影し、写真を自分の食事記録に残す。', 'Photograph a meal and keep the picture in your food journal.')],
    'table-seat': [0, localized('为自己准备或点一顿想吃的饭，记下最喜欢的一道菜。', '食べたい食事を用意するか注文し、気に入った一品を記録する。', 'Prepare or order a meal you would like and note a favorite dish.')],
    'menu-adviser': [0, localized('挑一家想去的餐厅，保存一张菜单或记下想尝的菜品。', '行ってみたいお店を一軒選び、メニューを保存するか食べてみたい料理を記録する。', 'Choose a restaurant you would like to visit and save its menu or note a dish to try.')],
    'fridge-detective': [0, localized('整理一层冰箱，给食盒标上内容或存放日期。', '冷蔵庫の棚を一段整理し、保存容器に中身や保存日を表示する。', 'Organize one fridge shelf and label the containers with their contents or storage dates.')],
    'tea-coaster': [0, localized('准备一杯喜欢的饮品，记下一种喜欢的搭配。', '好きな飲み物を一杯用意し、気に入った組み合わせを記録する。', 'Make a drink you enjoy and note a favorite pairing.')],
    'dinner-note': [3, localized('连续三天，每天记下一顿餐食的菜名或用餐感想。', '3日間、毎日一度の食事について料理名または感想を記録する。', 'For three consecutive days, write down a dish or a memory from one meal each day.')]
  };
  const tasks = Object.freeze(stories.map(story => Object.freeze({
    id: story.id, days: conditions[story.id][0], reward: 10, lineCount: story.lines.length
  })));
  const language = value => ['zh', 'ja', 'en'].includes(value) ? value : 'zh';
  const task = id => tasks.find(entry => entry.id === id) || null;
  function content(id, dialogueLanguage, uiLanguage) {
    const story = stories.find(entry => entry.id === id);
    if (!story) return null;
    const dialogue = language(dialogueLanguage), ui = language(uiLanguage);
    return { ...task(id), title: story.title[dialogue], condition: conditions[id][1][ui], dialogue,
      lines: story.lines.map(line => ({
        speaker: line.speaker === 'you' ? { zh: '你', ja: 'あなた', en: 'You' }[dialogue] : '',
        text: line.text[dialogue], isPlayer: line.speaker === 'you'
      }))
    };
  }
  return Object.freeze({ batchId: '20261126-01', storyRevision: '20261126-events1', tasks, task, content });
});
