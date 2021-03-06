var chat = function() {

    // private
    var KEY_TAB = 9;

    var update_interval_min = 1000;
    var update_interval_max = 1000 * 60;
    var update_interval_error = 1000 * 10;
    var update_interval = update_interval_min;
    var message_display_max = 70;
    var timestamp_display_format = 'g:i&\\n\\b\\s\\p;A';
    var timestamp_iso8601_format = 'Y-m-d\TH:i:s';
    var do_polling = true;

    var room;
    var pristineTitle;
    var account;
    var url_message_next;
    var $chatlog;
    var $msg_template;
    var $text_entry_content;

    var idleTime = 120000; // 2 minutes
    var isIdle = false;
    var missedMessageCount = 0; // incremented when idle

    function textEntrySubmit() {
        var msg = $text_entry_content.val();
        if (msg.length > 0) {
            sendMessage(msg);
            $text_entry_content.val('');
            update_interval = update_interval_min; // FIXME need to cancel pending update and retrigger it with this new interval
        }
        return false;
    }

    function textEntryKeydown(event) {
        if (event.which == KEY_TAB) {
            var userlist = $('#userlist tr').map(function(){return this.id.substr(5)});
            autocompleteUsername($(event.target), userlist);
            return false;
        }
    }

    // takes a text field and an array of strings for autocompletion
    function autocompleteUsername($input, names) {
        var value = $input.val();
        var candidates = [];
        var i;

        // ensure we have text, no text is selected, and cursor is at end of text
        if (value.length > 0 && $input[0].selectionStart == $input[0].selectionEnd && $input[0].selectionStart == value.length) {
	    // filter names to find only strings that start with existing value
	    for (i = 0; i < names.length; i++) {
                if ( names[i].toLowerCase().indexOf(value.toLowerCase()) == 0 && names[i].length >= value.length ) {
	            candidates.push(names[i]);
                }
	    }
            if (candidates.length > 0) {
	        // some candidates for autocompletion are found
	        if (candidates.length == 1) {
	            $input.val(candidates[0] + ': ');
	        } else {
	            $input.val(longestInCommon( candidates, value.length ));
	        }
	        return true;
            }
        }
        return false;
    }

    function scrollToBottom() {
        // trim message list
        var $messages = $chatlog.find('.message:visible');
        if ($messages.length > message_display_max) {
            $messages.slice(0, $messages.length - message_display_max).remove();
        }
        // scroll to bottom
        var dest = $('html').attr('scrollHeight') - $('html').attr('clientHeight');
        $('html').scrollTop(dest);
        $('body').scrollTop(dest); // FIXME this is a chromium workaround for bug #2891
    }

    /* formats a timestamp abbr content based on an ISO8601 timestamp in its title attr, or a
    separate date object */
    function localizeTimestamp($abbr, timestamp) {
        if (timestamp == null) {
            timestamp = parseDate($abbr.attr('title'));
        } else {
            $abbr.attr('title', timestamp.format(timestamp_iso8601_format));
        }
        $abbr.html(timestamp.format(timestamp_display_format));
    }

    function createMessage(timestamp, sender, msg) {
        var $msg_new = $msg_template.clone();
        $msg_new.css('display', '');
        localizeTimestamp($msg_new.find('.msg-timestamp abbr'), timestamp);
        $msg_new.find('.msg-sender').html(sender);
        $msg_new.find('.msg-content').html(msg);
        return $msg_new;
    }

    function sendMessage(msg) {
        var $msg_new;

        function success(data) {
            do_polling = true;
            message = $.parseJSON(data);
            var $new_id = "message-" + account.nickname + "-" + message.id;
            $msg_new.attr("id",$new_id);
        }

        function error() {
            alert('failure');
            do_polling = true;
        }

        $msg_new = createMessage(new Date(), account.nickname, msg);
        $msg_new.attr("id","message-temp-local");
        $msg_template.before($msg_new);
        scrollToBottom();
        var post_url = '/api/room/' + room.key + '/msg/';
        do_polling = false;
        $.ajax({
            url: post_url,
            type: "POST",
            data: { message: msg },
            success: success,
            error: error,
        });
        return false;
    }

    function updateChat() {

        function success(data) {
            if (data.messages) {
                $.each(data.messages, function (index, message) {
                    switch(message.event) {               
                    case 'topic':
                        $('#room-topic').text(message.content);
                        pristineTitle = room.name + ': ' + message.content;
                        document.title = pristineTitle;
                        break;
                    case 'part':
                        var $removeuser = 'user-' + message.sender_name;
                        $("#" + $removeuser).remove();
                        break;
                    case 'join':
                        var $adduser = 'user-' + message.sender_name;
                        if ($("#" + $adduser).length == 0){
                            $tablerow_toinsert = '<tr id="user-' + message.sender_name + '"><td>' +  message.extra + ' ' + message.sender_name + '</td></tr>';
                            $('#userlist tr:last').after($tablerow_toinsert);
                        }
                        break;
                    default:
                        break;
                    }
                    //always do 'message' type
                    var $match_id = "message-" + message.sender_name + "-" + message.id;
                    var $found_message = $('#' + $match_id);
                    if ($found_message.length != 0) {
                        // for now, lets update the content (until we do it in js)
                        $found_message.find('.msg-content').html(message.content);
                    } 
                    else {
                        var $msg_new = createMessage(parseDate(message.timestamp),
                                                     message.sender_name, message.content);
                        $msg_new.addClass('event-' + message.event);
                        $msg_template.before($msg_new);
                    }
                    
                    if ( isIdle )
                    {
                        $.sound.play( '/sounds/message.wav' )
                        ++missedMessageCount;
                        document.title = '(' + missedMessageCount + ') ' + pristineTitle;
                    }
                    
                });
                scrollToBottom();
                url_message_next = data.next;
                update_interval = update_interval_min;
            } else {
                // FIXME: we've temporarily changed the backoff from exponential to linear. + 2000 instead of * 2
                update_interval = Math.min(update_interval + 2000, update_interval_max);
            }
            setTimeout(updateChat, update_interval);
        }

        function error(request, status, error) {
            // give the server/network/etc some time to settle before retrying
            update_interval = update_interval_error;
            setTimeout(updateChat, update_interval);
            // TODO inform the user about the problem
        }

        $.ajax({
            url: url_message_next,
            dataType: 'json',
            success: success,
            error: error,
        });
    }

    function parseDate(str) {
        /* From http://anentropic.wordpress.com/2009/06/25/javascript-iso8601-parser-and-pretty-dates/
        Parses an ISO8601-formated date in UTC, i.e. yyyy-mm-ddThh:mm:ss.ssssss . */
            
        var parts = str.split('T'),
        dateParts = parts[0].split('-'),
        timeParts = parts[1].split(':'),
        timeSecParts = timeParts[2].split('.'),
        timeHours = Number(timeParts[0]),
        date = new Date;

        date.setUTCFullYear(Number(dateParts[0]));
        date.setUTCMonth(Number(dateParts[1])-1);
        date.setUTCDate(Number(dateParts[2]));
        date.setUTCHours(Number(timeHours));
        date.setUTCMinutes(Number(timeParts[1]));
        date.setUTCSeconds(Number(timeSecParts[0]));
        if (timeSecParts[1]) {
            date.setUTCMilliseconds(Math.round(Number(timeSecParts[1])/1000));
        }

        // by using setUTC methods the date has already been converted to local time
        return date;
    }

    // finds the longest common substring in the given data set.
    // takes an array of strings and a starting index
    function longestInCommon(candidates, index) {
        var i, ch, memo;

        do {
            memo = null;
            for (i = 0; i < candidates.length; i++) {
	        ch = candidates[i].charAt(index);
	        if (!ch) { break };
	        if (!memo) { memo = ch; }
	        else if (ch != memo) { break; }
            }
        } while (i == candidates.length && ++index);

        return candidates[0].slice(0, index);
    }
    
    function OnIdle()
    {
        //sendMessage( );
        isIdle = true;
    }
    
    function OnUnidle()
    {
        //sendMessage( );
        isIdle = false;
        missedMessageCount = 0;
        document.title = pristineTitle;
    }

    function initialize(the_room, the_account, message_last_key) {
        // initialize "statics"
        room = the_room;
        account = the_account;
        url_message_next = '/api/room/' + room.key + '/msg/?since=' + message_last_key;
        $chatlog = $('#chatlog');
        $msg_template = $chatlog.find('.message').last();
        $text_entry_content = $('#text-entry-content');

        // apply jquery hooks and behaviors
        $('#room-topic').editable('/api/room/' + room.key + '/topic', {
            indicator   : 'Saving...',
            tooltip     : 'Click to edit',
            name        : 'topic',
            ajaxoptions : { dataType: 'json' },
            callback    : function (value, settings) { $(this).html(value.message) },
        });
        $('#text-entry').submit(textEntrySubmit).keydown(textEntryKeydown);

        // gather the bare title
        pristineTitle = document.title;

        // prepare the window for user interaction
        $('.message:visible .msg-timestamp abbr').each(function () { localizeTimestamp($(this)) });
        scrollToBottom();
        $('#text-entry-content').focus();

        // set up idle timer
        $(document).bind( "idle.idleTimer", OnIdle );
        $(document).bind( "active.idleTimer", OnUnidle );
        $.idleTimer( idleTime );

        // start the update loop rolling
        setTimeout(updateChat);    
    }


    // public
    return {
        initialize: initialize,
    };

}();


// add .format to Date objects -- emulates PHP's date()
// from http://jacwright.com/projects/javascript/date_format
Date.prototype.format=function(format){var returnStr='';var replace=Date.replaceChars;for(var i=0;i<format.length;i++){var curChar=format.charAt(i);if(i-1>=0&&format.charAt(i-1)=="\\"){returnStr+=curChar;}else if(replace[curChar]){returnStr+=replace[curChar].call(this);}else if(curChar!="\\"){returnStr+=curChar;}}return returnStr;};Date.replaceChars={shortMonths:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],longMonths:['January','February','March','April','May','June','July','August','September','October','November','December'],shortDays:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],longDays:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],d:function(){return(this.getDate()<10?'0':'')+this.getDate();},D:function(){return Date.replaceChars.shortDays[this.getDay()];},j:function(){return this.getDate();},l:function(){return Date.replaceChars.longDays[this.getDay()];},N:function(){return this.getDay()+1;},S:function(){return(this.getDate()%10==1&&this.getDate()!=11?'st':(this.getDate()%10==2&&this.getDate()!=12?'nd':(this.getDate()%10==3&&this.getDate()!=13?'rd':'th')));},w:function(){return this.getDay();},z:function(){var d=new Date(this.getFullYear(),0,1);return Math.ceil((this-d)/86400000);},W:function(){var d=new Date(this.getFullYear(),0,1);return Math.ceil((((this-d)/86400000)+d.getDay()+1)/7);},F:function(){return Date.replaceChars.longMonths[this.getMonth()];},m:function(){return(this.getMonth()<9?'0':'')+(this.getMonth()+1);},M:function(){return Date.replaceChars.shortMonths[this.getMonth()];},n:function(){return this.getMonth()+1;},t:function(){var d=new Date();return new Date(d.getFullYear(),d.getMonth(),0).getDate()},L:function(){var year=this.getFullYear();return(year%400==0||(year%100!=0&&year%4==0));},o:function(){var d=new Date(this.valueOf());d.setDate(d.getDate()-((this.getDay()+6)%7)+3);return d.getFullYear();},Y:function(){return this.getFullYear();},y:function(){return(''+this.getFullYear()).substr(2);},a:function(){return this.getHours()<12?'am':'pm';},A:function(){return this.getHours()<12?'AM':'PM';},B:function(){return Math.floor((((this.getUTCHours()+1)%24)+this.getUTCMinutes()/60+this.getUTCSeconds()/3600)*1000/24);},g:function(){return this.getHours()%12||12;},G:function(){return this.getHours();},h:function(){return((this.getHours()%12||12)<10?'0':'')+(this.getHours()%12||12);},H:function(){return(this.getHours()<10?'0':'')+this.getHours();},i:function(){return(this.getMinutes()<10?'0':'')+this.getMinutes();},s:function(){return(this.getSeconds()<10?'0':'')+this.getSeconds();},u:function(){var m=this.getMilliseconds();return(m<10?'00':(m<100?'0':''))+m;},e:function(){return"Not Yet Supported";},I:function(){return"Not Yet Supported";},O:function(){return(-this.getTimezoneOffset()<0?'-':'+')+(Math.abs(this.getTimezoneOffset()/60)<10?'0':'')+(Math.abs(this.getTimezoneOffset()/60))+'00';},P:function(){return(-this.getTimezoneOffset()<0?'-':'+')+(Math.abs(this.getTimezoneOffset()/60)<10?'0':'')+(Math.abs(this.getTimezoneOffset()/60))+':00';},T:function(){var m=this.getMonth();this.setMonth(0);var result=this.toTimeString().replace(/^.+ \(?([^\)]+)\)?$/,'$1');this.setMonth(m);return result;},Z:function(){return-this.getTimezoneOffset()*60;},c:function(){return this.format("Y-m-d\\TH:i:sP");},r:function(){return this.toString();},U:function(){return this.getTime()/1000;}};
