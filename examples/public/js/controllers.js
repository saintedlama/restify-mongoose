var noteControllers = angular.module('noteControllers', []);
noteControllers.config(['$httpProvider', function($httpProvider) {
    $httpProvider.defaults.headers.patch = {
        'Content-Type': 'application/json;charset=utf-8'
    }
}]);

noteControllers.constant('serviceUrl', '/notes');
noteControllers.directive('ngError', function() {
    return {
        restrict: 'E',
        scope: {
            field: '=field'
        },
        template: '<p ng-show="field">{{field.message}}</p>'
    }
});

noteControllers.directive('ngTags', function() {
    return {
        restrict: 'E',
        scope: {
            tags : '=tags'
        },
        template: '<span class="label label-primary" ng-repeat="tag in tags">{{tag}}</span>'
    }
});

noteControllers.controller('NoteListCtrl', ['$scope', '$http', 'serviceUrl',
    function($scope, $http, serviceUrl) {
        $scope.load = function() {
            $http.get(serviceUrl)
                .success(function(notes) {
                    $scope.notes = notes;
                });
        }

        $scope.load();
    }
]);

noteControllers.controller('NoteDetailCtrl', ['$scope', '$routeParams', '$http', 'serviceUrl',
    function($scope, $routeParams, $http, serviceUrl) {
        $scope.load = function() {
            $http.get(serviceUrl + '/' + $routeParams.noteId)
                .success(function(note) {
                    $scope.note = note;
                });
        }

        $scope.load();
    }
]);

noteControllers.controller('NoteDeleteCtrl', ['$scope', '$routeParams', '$http', '$location', 'serviceUrl',
    function($scope, $routeParams, $http, $location, serviceUrl) {
        $scope.load = function() {
            $http.get(serviceUrl + '/' + $routeParams.noteId)
                .success(function(note) {
                    $scope.note = note;
                });
        }

        $scope.delete = function() {
            $http({
                method : 'DELETE',
                url : serviceUrl + '/' + $routeParams.noteId
            }).success(function() {
                $location.path('/notes');
            });
        }

        $scope.load();
    }
]);

noteControllers.controller('NoteCreateCtrl', ['$scope', '$routeParams', '$http', '$location', 'serviceUrl',
    function($scope, $routeParams, $http, $location, serviceUrl) {
        $scope.createNote = function() {
            $http.post(serviceUrl, $scope.note)
                .success(function() {
                    $location.path('/notes');
                })
                .error(function(message) {
                    $scope.errors = message.errors;
                });
        };
    }
]);

noteControllers.controller('NoteEditCtrl', ['$scope', '$routeParams', '$http', '$location', 'serviceUrl',
    function($scope, $routeParams, $http, $location, serviceUrl) {
        $scope.load = function() {
            $http.get(serviceUrl + '/' + $routeParams.noteId)
                .success(function(note) {
                    $scope.note = note;
                });
        }

        $scope.save = function() {
            $http({
                method : 'PATCH',
                url : serviceUrl + '/' + $routeParams.noteId,
                data : $scope.note
            }).success(function() {
                $location.path('/notes');
            })
            .error(function(message) {
                $scope.errors = message.errors;
            });
        }

        $scope.load();
    }
]);