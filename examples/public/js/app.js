var noteApp = angular.module('noteApp', ['ngRoute', 'noteControllers']);

noteApp.config(['$routeProvider', function($routeProvider) {
        $routeProvider.
            when('/notes', {
                templateUrl: 'partials/note-list.html',
                controller: 'NoteListCtrl'
            }).
            when('/notes/create', {
                templateUrl: 'partials/note-create.html',
                controller: 'NoteCreateCtrl'
            }).
            when('/notes/delete/:noteId', {
                templateUrl: 'partials/note-delete.html',
                controller: 'NoteDeleteCtrl'
            }).
            when('/notes/detail/:noteId', {
                templateUrl: 'partials/note-detail.html',
                controller: 'NoteDetailCtrl'
            }).
            when('/notes/edit/:noteId', {
                templateUrl: 'partials/note-edit.html',
                controller: 'NoteEditCtrl'
            }).
            otherwise({
                redirectTo: '/notes'
            });
    }]);