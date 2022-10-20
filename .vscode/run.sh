DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
echo copying latest common components
#cp $DIR/../../webos-common/Enyo/Updater-Helper.js $DIR/../enyo-app/helpers/Updater.js
$DIR/../build.sh webos
palm-install $DIR/../bin/com.webosarchive.checkmatehd_1.1.0_all.ipk
palm-launch com.webosarchive.checkmatehd
palm-log -f com.webosarchive.checkmatehd
