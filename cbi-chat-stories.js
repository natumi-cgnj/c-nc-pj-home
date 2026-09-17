(function (global) {
  'use strict';

  global.CBI_CHAT_STORIES = [
    {
      id: 'jane_queue_thought_v1',
      title: '排队的时候',
      threadId: 'jane',
      trigger: {
        type: 'status_all',
        values: ['排队', '想patrick']
      },
      delayMinutes: [8, 25],
      once: false,
      cooldownHours: 24 * 30,
      messages: [
        { sender: 'jane', text: '想我会让手续变快吗' }
      ],
      replies: [
        { id: 'pleasant', text: '没有，只是很愉快', messages: [] }
      ]
    },
    {
      id: 'team_autopsy_report_v1',
      title: '尸检报告',
      threadId: 'team',
      trigger: { type: 'manual' },
      delayMinutes: 0,
      once: false,
      cooldownHours: 0,
      messages: [
        { sender: 'cho', text: '尸检报告' },
        { sender: 'boss', text: '……看得出来是尸检报告。' },
        { sender: 'cho', text: '嗯。' }
      ]
    }
  ];
})(window);
