import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true },
    redirect: '/users',
    children: [
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/UsersView.vue'),
      },
      {
        path: 'users/:id',
        name: 'UserDetail',
        component: () => import('../views/UserDetailView.vue'),
        props: true,
      },
      {
        path: 'routes',
        name: 'Routes',
        component: () => import('../views/RoutesView.vue'),
      },
      {
        path: 'activities',
        name: 'Activities',
        component: () => import('../views/ActivitiesView.vue'),
      },
      {
        path: 'activities/:id',
        name: 'ActivityDetail',
        component: () => import('../views/ActivityDetailView.vue'),
        props: true,
      },
      {
        path: 'map',
        name: 'LiveMap',
        component: () => import('../views/LiveMapView.vue'),
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('../views/ChatView.vue'),
      },
      {
        path: 'connectivity',
        name: 'Connectivity',
        component: () => import('../views/ConnectivityView.vue'),
      },
      {
        path: 'whatsapp-messages',
        name: 'WhatsappMessages',
        component: () => import('../views/WhatsappMessagesView.vue'),
      },
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth !== false && !token) {
    next('/login')
  } else if (to.name === 'Login' && token) {
    next('/')
  } else {
    next()
  }
})

export default router
