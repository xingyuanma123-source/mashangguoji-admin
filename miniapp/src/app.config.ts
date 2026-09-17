const pages = [
  'pages/submit/index',
  'pages/records/index',
  'pages/profile/index',
  'pages/login/index',
  'pages/legal/index',
  'pages/record-detail/index',
  'pages/record-edit/index'
]

export default defineAppConfig({
  pages,
  lazyCodeLoading: 'requiredComponents',
  tabBar: {
    color: '#6b7280',
    selectedColor: '#3b82f6',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/submit/index',
        text: '报账',
        iconPath: 'static/images/tab_submit.png',
        selectedIconPath: 'static/images/tab_submit_selected.png'
      },
      {
        pagePath: 'pages/records/index',
        text: '记录',
        iconPath: 'static/images/tab_records.png',
        selectedIconPath: 'static/images/tab_records_selected.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'static/images/tab_profile.png',
        selectedIconPath: 'static/images/tab_profile_selected.png'
      }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '司机报账',
    navigationBarTextStyle: 'black'
  }
})
